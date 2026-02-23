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

export interface EcsStackProps extends StackProps {
  vpc: ec2.IVpc;
  appSubnets: ec2.ISubnet[];
  ecsSecurityGroup: ec2.ISecurityGroup;
  dbSecret: secretsmanager.ISecret;
  db: rds.DatabaseInstance;
  repository: ecr.Repository;
  targetGroup: elbv2.ApplicationTargetGroup
  config: OrdersAppConfig;
}

export class EcsStack extends Stack {
  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    const { vpc, appSubnets, ecsSecurityGroup, dbSecret, db, repository, targetGroup, config } = props;

    /**
     * ECS Cluster (EC2) + Capacity Provider
     */
    const cluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc,
      clusterName: config.ecsClusterName
    });

    // AutoScalingGroup backing the EC2 capacity
    const asg = new autoscaling.AutoScalingGroup(this, 'EcsAsg', {
      vpc,
      vpcSubnets: { subnets: appSubnets },
      instanceType: new ec2.InstanceType('t3.small'),
      minCapacity: config.asgMinCapacity,
      maxCapacity: config.asgMaxCapacity,
      desiredCapacity: config.asgDesiredCapacity,
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      securityGroup: ecsSecurityGroup
    });

    // Allow ECS agent on instances to talk to ECS + pull images, etc. (standard)
    asg.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2ContainerServiceforEC2Role')
    );

    const cp = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      autoScalingGroup: asg,
      enableManagedScaling: false,
      enableManagedTerminationProtection: false
    });

    cluster.addAsgCapacityProvider(cp);

    /**
    * Task Definition (EC2)
    * - dynamic host port (0), container port 8080
    * - CloudWatch logs (awslogs)
    * - env vars for datasource url/username
    * - secret injection for datasource password
    */
    const taskDef = new ecs.Ec2TaskDefinition(this, 'TaskDef', {
      networkMode: ecs.NetworkMode.AWS_VPC
    });

    // CloudWatch Logs group
    const logGroup = new logs.LogGroup(this, 'OrdersAppLogGroup', {
      logGroupName: `/ecs/${cdk.Stack.of(this).stackName}/app`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Execution role permissions:
    // - ECR pull + Logs are covered by AmazonECSTaskExecutionRolePolicy
    // - add SecretsManager read for injection
    taskDef.executionRole?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
    );
    taskDef.executionRole?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [dbSecret.secretArn]
      })
    );

    const jdbcUrl = `jdbc:postgresql://${db.dbInstanceEndpointAddress}:${db.dbInstanceEndpointPort}/${config.dbName}`;

    const container = taskDef.addContainer('AppContainer', {
      image: ecs.ContainerImage.fromEcrRepository(repository, config.imageTag),
      memoryReservationMiB: config.containerMemoryReservationMB,
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: 'app'
      }),
      environment: {
        SPRING_DATASOURCE_URL: jdbcUrl,
        SPRING_DATASOURCE_USERNAME: 'postgres'
      },
      secrets: {
        SPRING_DATASOURCE_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password')
      }
    });

    container.addPortMappings({
      containerPort: config.appPort,
      hostPort: 0,
      protocol: ecs.Protocol.TCP
    });

    /**
     * ECS Service (EC2 launch type via capacity provider)
     * - desired tasks 2
     * - private subnets (app-private)
     * - attach ECS SG
     * - health check grace period 300s
     * - spread tasks across AZs (best effort)
     */
    const service = new ecs.Ec2Service(this, 'Service', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: config.ec2ServiceDesiredCount,
      healthCheckGracePeriod: cdk.Duration.seconds(config.ec2ServiceHealthCheckGracePeriodSeconds),
      vpcSubnets: { subnetGroupName: 'app-private' },
      securityGroups: [ecsSecurityGroup],
      capacityProviderStrategies: [
        {
          capacityProvider: cp.capacityProviderName,
          weight: 1
        }
      ],
      placementStrategies: [
        ecs.PlacementStrategy.spreadAcross('attribute:ecs.availability-zone'),
        ecs.PlacementStrategy.spreadAcross('instanceId')
      ]
    });

    // Register service with the target group (IP targets, awsvpc mode)
    service.attachToApplicationTargetGroup(targetGroup);
  }
}