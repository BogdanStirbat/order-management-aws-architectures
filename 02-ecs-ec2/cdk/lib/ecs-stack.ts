import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from 'constructs';
import type { OrdersAppConfig } from "./config";

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
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
  repository: ecr.Repository;
  targetGroup: elbv2.ApplicationTargetGroup;
  cognitoIssuerUri: string;
  cognitoUserPoolClientId: string;
  config: OrdersAppConfig;
}

interface ClusterCapacityResources {
  cluster: ecs.Cluster;
  capacityProvider: ecs.AsgCapacityProvider;
}

interface TaskDefinitionResources {
  taskDefinition: ecs.Ec2TaskDefinition;
  logGroup: logs.LogGroup;
}

export class EcsStack extends Stack {
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.Ec2Service;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    const clusterCapacity = this.createClusterAndCapacity(props);
    this.cluster = clusterCapacity.cluster;

    const taskResources = this.createTaskDefinition(props);
    this.logGroup = taskResources.logGroup;

    this.service = this.createService({
      cluster: clusterCapacity.cluster,
      capacityProvider: clusterCapacity.capacityProvider,
      taskDefinition: taskResources.taskDefinition,
      targetGroup: props.targetGroup,
      appSubnets: props.appSubnets,
      ecsSecurityGroup: props.ecsSecurityGroup,
      config: props.config,
    });
  }

  private createClusterAndCapacity(props: EcsStackProps): ClusterCapacityResources {
    const { vpc, appSubnets, ecsSecurityGroup, config } = props;

    const cluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc,
      clusterName: config.ecsClusterName,
    });

    const instanceRole = new iam.Role(this, 'EcsInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonEC2ContainerServiceforEC2Role',
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
    });

    // skipping the `echo "ECS_CLUSTER=${config.ecsClusterName}" >> /etc/ecs/ecs.config` line because
    // CDK is already injecting echo ECS_CLUSTER=<cluster-name> >> /etc/ecs/ecs.config
    // when the capacity provider is added to the cluster 
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'echo "ECS_ENABLE_CONTAINER_METADATA=true" >> /etc/ecs/ecs.config',
      'echo "ECS_LOGLEVEL=info" >> /etc/ecs/ecs.config',

      'yum install -y amazon-cloudwatch-agent',

      'cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<\'EOF\'',
      JSON.stringify({
        logs: {
          logs_collected: {
            files: {
              collect_list: [
                {
                  file_path: "/var/log/messages",
                  log_group_name: "/ec2/orders-app/system",
                  log_stream_name: "{instance_id}/messages",
                },
                {
                  file_path: "/var/log/ecs/ecs-agent.log",
                  log_group_name: "/ec2/orders-app/ecs-agent",
                  log_stream_name: "{instance_id}/ecs-agent",
                },
                {
                  file_path: "/var/log/ecs/ecs-init.log",
                  log_group_name: "/ec2/orders-app/ecs-init",
                  log_stream_name: "{instance_id}/ecs-init",
                }
              ]
            }
          }
        },
        metrics: {
          namespace: "OrdersApp/EC2",
          append_dimensions: {
            InstanceId: "${aws:InstanceId}"
          },
          metrics_collected: {
            mem: {
              measurement: ["mem_used_percent"]
            },
            disk: {
              measurement: ["used_percent"],
              resources: ["*"]
            }
          }
        }
      }),
      'EOF',

      '/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s'
    );

    const launchTemplate = new ec2.LaunchTemplate(this, 'EcsLaunchTemplate', {
      machineImage: ecs.EcsOptimizedImage.amazonLinux2023(),
      instanceType: new ec2.InstanceType(config.ec2InstanceType),
      securityGroup: ecsSecurityGroup,
      role: instanceRole,
      userData,
      requireImdsv2: true,
    });

    const asg = new autoscaling.AutoScalingGroup(this, 'EcsAsg', {
      vpc,
      vpcSubnets: { subnets: appSubnets },

      launchTemplate,

      minCapacity: config.asgMinCapacity,
      maxCapacity: config.asgMaxCapacity,
      desiredCapacity: config.asgDesiredCapacity,

      newInstancesProtectedFromScaleIn: true,
    });

    const capacityProvider = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      autoScalingGroup: asg,
      enableManagedScaling: true,

      // graceful shutdown / rescheduling
      enableManagedTerminationProtection: true,
      enableManagedDraining: true,

      targetCapacityPercent: 90,
      minimumScalingStepSize: 1,
      maximumScalingStepSize: 1,

      instanceWarmupPeriod: 300,
    });

    cluster.addAsgCapacityProvider(capacityProvider);

    return {
      cluster,
      capacityProvider,
    };
  }

  private createTaskDefinition(props: EcsStackProps): TaskDefinitionResources {
    const {
      dbSecret,
      db,
      repository,
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

    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDef', {
      networkMode: ecs.NetworkMode.AWS_VPC,
      executionRole,
      taskRole,
    });

    const logGroup = new logs.LogGroup(this, 'OrdersAppLogGroup', {
      logGroupName: `/ecs/${Stack.of(this).stackName}/app`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const jdbcUrl = `jdbc:postgresql://${db.dbInstanceEndpointAddress}:${db.dbInstanceEndpointPort}/${config.dbName}`;

    const container = taskDefinition.addContainer('AppContainer', {
      image: ecs.ContainerImage.fromEcrRepository(repository, config.appImageTag),
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
      image: ecs.ContainerImage.fromEcrRepository(repository, config.adotImageTag),
      essential: false,
      memoryReservationMiB: 256,
      memoryLimitMiB: 512,
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
    capacityProvider: ecs.AsgCapacityProvider;
    taskDefinition: ecs.Ec2TaskDefinition;
    targetGroup: elbv2.IApplicationTargetGroup;
    appSubnets: ec2.ISubnet[];
    ecsSecurityGroup: ec2.ISecurityGroup;
    config: OrdersAppConfig;
  }): ecs.Ec2Service {
    const {
      cluster,
      capacityProvider,
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

    const service = new ecs.Ec2Service(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: config.ec2ServiceDesiredCount,
      healthCheckGracePeriod: cdk.Duration.seconds(
        config.ec2ServiceHealthCheckGracePeriodSeconds,
      ),
      vpcSubnets: { subnets: appSubnets },
      securityGroups: [ecsSecurityGroup],
      capacityProviderStrategies: [
        {
          capacityProvider: capacityProvider.capacityProviderName,
          weight: 1,
        },
      ],
      placementStrategies: [
        ecs.PlacementStrategy.spreadAcross('attribute:ecs.availability-zone'),
        ecs.PlacementStrategy.spreadAcross('instanceId'),
      ],

      // safer rolling deployments
      minHealthyPercent: 100,
      maxHealthyPercent: 200,

      // fail and roll back automatically if deployment does not reach steady state
      circuitBreaker: {
        enable: true,
        rollback: true,
      },

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
      minCapacity: config.ec2ServiceMinCapacity,
      maxCapacity: config.ec2ServiceMaxCapacity,
    });

    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: config.ec2ServiceCpuTargetUtilizationPercent,
      scaleInCooldown: cdk.Duration.seconds(120),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: config.ec2ServiceMemoryTargetUtilizationPercent,
      scaleInCooldown: cdk.Duration.seconds(120),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    return service;
  }
}