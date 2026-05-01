import * as cdk from "aws-cdk-lib";
import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";

export interface DatabaseStackProps extends StackProps {
  vpc: ec2.IVpc;
  dbSg: ec2.ISecurityGroup;
  proxySg: ec2.ISecurityGroup;
}

export class DatabaseStack extends Stack {
  public readonly dbName = "ordersdb";
  public readonly cluster: rds.DatabaseCluster;
  public readonly proxy: rds.DatabaseProxy;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { vpc, dbSg, proxySg } = props;

    this.cluster = new rds.DatabaseCluster(this, "OrdersAuroraCluster", {
      clusterIdentifier: "orders-aurora-serverless-v2",
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4
      }),
      credentials: rds.Credentials.fromGeneratedSecret("postgres", {
        secretName: "orders-lambda/aurora/postgres"
      }),
      defaultDatabaseName: this.dbName,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      securityGroups: [dbSg],
      writer: rds.ClusterInstance.serverlessV2("writer"),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 2,
      backup: {
        retention: Duration.days(7)
      },
      storageEncrypted: true,
      removalPolicy: RemovalPolicy.DESTROY
    });

    this.proxy = new rds.DatabaseProxy(this, "OrdersRdsProxy", {
      proxyTarget: rds.ProxyTarget.fromCluster(this.cluster),
      dbProxyName: "orders-rds-proxy",
      secrets: [this.cluster.secret!],
      vpc,
      securityGroups: [proxySg],
      requireTLS: true,
      iamAuth: false,
      debugLogging: false
    });

    new cdk.CfnOutput(this, "RdsProxyEndpoint", {
      value: this.proxy.endpoint
    });

    new cdk.CfnOutput(this, "AuroraSecretArn", {
      value: this.cluster.secret!.secretArn
    });
  }
}