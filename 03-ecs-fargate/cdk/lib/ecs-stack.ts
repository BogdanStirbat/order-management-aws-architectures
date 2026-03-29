import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from 'constructs';
import type { OrdersAppConfig } from "./config";

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as rds from "aws-cdk-lib/aws-rds";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";

export interface EcsStackProps extends StackProps {
  vpc: ec2.IVpc;
  appSubnets: ec2.ISubnet[];
  ecsSecurityGroup: ec2.ISecurityGroup;
  dbSecret: secretsmanager.ISecret;
  db: rds.DatabaseInstance;
  appRepository: ecr.Repository;
  adotRepository: ecr.Repository;
  targetGroup: elbv2.ApplicationTargetGroup;
  cognitoIssuerUri: string;
  cognitoUserPoolClientId: string;
  config: OrdersAppConfig;
}

interface TaskDefinitionResources {
  taskDefinition: ecs.FargateTaskDefinition;
  logGroup: logs.LogGroup;
}

export class EcsStack extends Stack {
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.FargateService;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    const { vpc, config } = props;
    this.cluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc,
      clusterName: config.ecsClusterName,
    });

    const taskResources = this.createTaskDefinition(props);
    this.logGroup = taskResources.logGroup;

    this.service = this.createService({
      cluster: this.cluster,
      taskDefinition: taskResources.taskDefinition,
      targetGroup: props.targetGroup,
      appSubnets: props.appSubnets,
      ecsSecurityGroup: props.ecsSecurityGroup,
      config: props.config,
    });
  }

  private createTaskDefinition(props: EcsStackProps): TaskDefinitionResources {
    const {
      dbSecret,
      db,
      appRepository,
      adotRepository,
      cognitoIssuerUri,
      cognitoUserPoolClientId,
      config,
    } = props;

    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy',
        ),
      ],
    });

    dbSecret.grantRead(executionRole);

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'),
      ],
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: config.fargateTaskCpu,
      memoryLimitMiB: config.fargateTaskMemoryMiB,
      executionRole,
      taskRole,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    const logGroup = new logs.LogGroup(this, 'OrdersAppLogGroup', {
      logGroupName: `/ecs/${Stack.of(this).stackName}/app`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const jdbcUrl = `jdbc:postgresql://${db.dbInstanceEndpointAddress}:${db.dbInstanceEndpointPort}/${config.dbName}`;

    const container = taskDefinition.addContainer('AppContainer', {
      image: ecs.ContainerImage.fromEcrRepository(appRepository, config.appImageTag),
      memoryReservationMiB: config.containerMemoryReservationMB,
      stopTimeout: cdk.Duration.seconds(60),
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: 'app',
      }),
      environment: {
        SPRING_DATASOURCE_URL: jdbcUrl,
        SPRING_DATASOURCE_USERNAME: 'postgres',
        COGNITO_ISSUER_URI: cognitoIssuerUri,
        COGNITO_USER_POOL_CLIENT_ID: cognitoUserPoolClientId,
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318/v1/traces",
      },
      secrets: {
        SPRING_DATASOURCE_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
      },
      healthCheck: {
        command: [
          'CMD-SHELL',
          'curl -f http://localhost:8080/actuator/health/liveness || exit 1',
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    container.addPortMappings({
      containerPort: config.appPort,
      protocol: ecs.Protocol.TCP,
    });

    // add an ADOT sidecar container
    const adotCollectorContainer = taskDefinition.addContainer("AdotCollector", {
      image: ecs.ContainerImage.fromEcrRepository(adotRepository, config.adotImageTag),
      essential: false,
      memoryReservationMiB: config.adotMemoryReservationMB,
      memoryLimitMiB: config.adotMemoryLimitMiB,
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: "adot",
      }),
      portMappings: [
        { containerPort: 4318, protocol: ecs.Protocol.TCP },
      ],
      command: ["--config=/etc/otel-config.yaml"],
    });

    container.addContainerDependencies({
      container: adotCollectorContainer,
      condition: ecs.ContainerDependencyCondition.START
    });

    return {
      taskDefinition,
      logGroup,
    };
  }

  private createService(params: {
    cluster: ecs.Cluster;
    taskDefinition: ecs.FargateTaskDefinition;
    targetGroup: elbv2.IApplicationTargetGroup;
    appSubnets: ec2.ISubnet[];
    ecsSecurityGroup: ec2.ISecurityGroup;
    config: OrdersAppConfig;
  }): ecs.FargateService {
    const {
      cluster,
      taskDefinition,
      targetGroup,
      appSubnets,
      ecsSecurityGroup,
      config,
    } = params;

    const alb5xxDeploymentAlarm = new cloudwatch.Alarm(this, "Alb5xxDeploymentAlarm", {
      alarmName: `${this.stackName}-deploy-alb-5xx`,
      metric: targetGroup.metrics.httpCodeTarget(
        elbv2.HttpCodeTarget.TARGET_5XX_COUNT,
        {
          period: cdk.Duration.minutes(1),
          statistic: "Sum",
        }
      ),
      threshold: 3,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const unhealthyTargetsDeploymentAlarm = new cloudwatch.Alarm(
      this,
      "UnhealthyTargetsDeploymentAlarm",
      {
        alarmName: `${this.stackName}-deploy-unhealthy-targets`,
        metric: targetGroup.metrics.unhealthyHostCount({
          period: cdk.Duration.minutes(1),
          statistic: "Average",
        }),
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: config.fargateServiceDesiredCount,
      assignPublicIp: false,
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: { subnets: appSubnets },

      healthCheckGracePeriod: cdk.Duration.seconds(
        config.fargateServiceHealthCheckGracePeriodSeconds,
      ),

      // fail and roll back automatically if deployment does not reach steady state
      circuitBreaker: {
        enable: true,
        rollback: true,
      },

      // safer rolling deployments
      minHealthyPercent: 100,
      maxHealthyPercent: 200,

      // optional but useful when using deployment alarms
      bakeTime: cdk.Duration.minutes(5),

      deploymentAlarms: {
        alarmNames: [
          alb5xxDeploymentAlarm.alarmName,
          unhealthyTargetsDeploymentAlarm.alarmName,
        ],
        behavior: ecs.AlarmBehavior.ROLLBACK_ON_ALARM,
      },
    });

    service.attachToApplicationTargetGroup(targetGroup);

    const scalableTarget = service.autoScaleTaskCount({
      minCapacity: config.fargateServiceMinCapacity,
      maxCapacity: config.fargateServiceMaxCapacity,
    });

    scalableTarget.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: config.fargateServiceCpuTargetUtilizationPercent,
      scaleInCooldown: cdk.Duration.seconds(120),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    scalableTarget.scaleOnMemoryUtilization("MemoryScaling", {
      targetUtilizationPercent: config.fargateServiceMemoryTargetUtilizationPercent,
      scaleInCooldown: cdk.Duration.seconds(120),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    return service;
  }
}