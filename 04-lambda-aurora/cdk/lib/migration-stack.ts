import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export interface MigrationStackProps extends StackProps {
  vpc: ec2.IVpc;
  migrationTaskSg: ec2.ISecurityGroup;
  proxy: rds.DatabaseProxy;
  cluster: rds.DatabaseCluster;
  dbName: string;
}

export class MigrationStack extends Stack {
  public readonly cluster: ecs.Cluster;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly securityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: MigrationStackProps) {
    super(scope, id, props);

    const { vpc, migrationTaskSg, proxy, cluster, dbName } = props;

    this.securityGroup = migrationTaskSg;

    this.cluster = new ecs.Cluster(this, "MigrationCluster", {
      vpc,
      clusterName: "orders-migration-cluster",
      containerInsights: true,
    });

    this.taskDefinition = new ecs.FargateTaskDefinition(this, "MigrationTaskDefinition", {
      family: "orders-db-migration",
      cpu: 256,
      memoryLimitMiB: 512,
    });

    const migrationImage = new ecrAssets.DockerImageAsset(this, "MigrationImage", {
      directory: path.resolve("./migration-runner"),
    });

    const dbSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      "AuroraSecret",
      cluster.secret!.secretArn
    );

    const logGroup = new logs.LogGroup(this, "MigrationLogGroup", {
      logGroupName: "/ecs/orders-db-migration",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.taskDefinition.addContainer("MigrationContainer", {
      image: ecs.ContainerImage.fromDockerImageAsset(migrationImage),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "flyway",
        logGroup,
      }),
      environment: {
        FLYWAY_URL: `jdbc:postgresql://${proxy.endpoint}:5432/${dbName}?sslmode=require`,
        FLYWAY_LOCATIONS: "filesystem:/flyway/sql",
        FLYWAY_CONNECT_RETRIES: "10",
        FLYWAY_VALIDATE_MIGRATION_NAMING: "true",
        FLYWAY_BASELINE_ON_MIGRATE: "false",
      },
      secrets: {
        FLYWAY_USER: ecs.Secret.fromSecretsManager(dbSecret, "username"),
        FLYWAY_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, "password"),
      },
      essential: true,
    });

    cluster.secret!.grantRead(this.taskDefinition.taskRole);

    new cdk.CfnOutput(this, "MigrationClusterName", {
      value: this.cluster.clusterName,
    });

    new cdk.CfnOutput(this, "MigrationTaskDefinitionArn", {
      value: this.taskDefinition.taskDefinitionArn,
    });

    new cdk.CfnOutput(this, "MigrationSecurityGroupId", {
      value: migrationTaskSg.securityGroupId,
    });

    new cdk.CfnOutput(this, "MigrationSubnetIds", {
      value: vpc.isolatedSubnets.map((subnet) => subnet.subnetId).join(","),
    });
  }
}