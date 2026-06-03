import * as path from "path";
import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import type { OrdersAppConfig } from "./config";

export interface LambdaStackProps extends StackProps {
  ordersTable: dynamodb.TableV2;
  config: OrdersAppConfig;
}

export class LambdaStack extends Stack {
  public readonly ordersFunction: lambda.Function;
  public readonly ordersAlias: lambda.Alias;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const { ordersTable, config } = props;

    this.ordersFunction = new lambda.Function(this, "OrdersApiFunction", {
      functionName: "orders-api-lambda",
      runtime: lambda.Runtime.JAVA_21,
      architecture: lambda.Architecture.ARM_64,
      handler: "com.order.management.lambdadynamodb.OrdersApiHandler::handleRequest",
      code: lambda.Code.fromAsset(
        path.resolve("../app/lambdadynamodb/target/lambdadynamodb-1.0.0.jar")
      ),
      memorySize: config.lambdaMemorySize,
      reservedConcurrentExecutions: config.lambdaReservedConcurrentExecutions, // protect RDS Proxy from traffic spikes
      snapStart: lambda.SnapStartConf.ON_PUBLISHED_VERSIONS,
      timeout: Duration.seconds(30),
      environment: {
        ORDERS_TABLE_NAME: ordersTable.tableName,
      },
      logRetention: logs.RetentionDays.ONE_WEEK
    });

    props.ordersTable.grantReadWriteData(this.ordersFunction);

    this.ordersAlias = new lambda.Alias(this, "OrdersApiLiveAlias", {
      aliasName: "live",
      version: this.ordersFunction.currentVersion,
    });

    new cdk.CfnOutput(this, "OrdersFunctionAliasArn", {
      value: this.ordersAlias.functionArn,
    });
  }
}