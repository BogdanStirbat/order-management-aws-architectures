import * as path from "path";
import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";

export interface LambdaConstructProps {
  vpc: ec2.IVpc;
  lambdaSg: ec2.ISecurityGroup;
  proxy: rds.DatabaseProxy;
  cluster: rds.DatabaseCluster;
  dbName: string;
}

export class LambdaConstruct extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaConstructProps) {
    super(scope, id);

    const { vpc, lambdaSg, proxy, cluster, dbName } = props;

    this.function = new lambda.Function(this, "OrdersApiFunction", {
      functionName: "orders-api-lambda",
      runtime: lambda.Runtime.JAVA_21,
      architecture: lambda.Architecture.ARM_64,
      handler: "com.order.management.lambdaaurora.OrdersApiHandler::handleRequest",
      code: lambda.Code.fromAsset(
        path.resolve("../lambdaaurora/target/lambdaaurora-1.0.0.jar")
      ),
      memorySize: 1024,
      timeout: Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [lambdaSg],
      environment: {
        DB_HOST: proxy.endpoint,
        DB_PORT: "5432",
        DB_NAME: dbName,
        DB_SECRET_ARN: cluster.secret!.secretArn,
      },
      logRetention: logs.RetentionDays.ONE_WEEK
    });

    cluster.secret!.grantRead(this.function);
  }
}