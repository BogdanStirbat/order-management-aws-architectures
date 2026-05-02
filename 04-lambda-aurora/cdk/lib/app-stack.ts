import * as cdk from "aws-cdk-lib";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";

import { LambdaConstruct } from "./constructs/lambda-construct";
import { CognitoConstruct } from "./constructs/cognito-construct";
import { ApiConstruct } from "./constructs/api-construct";
import { MigrationConstruct } from "./constructs/migration-construct";

export interface AppStackProps extends StackProps {
  vpc: ec2.IVpc;
  lambdaSg: ec2.ISecurityGroup;
  proxy: rds.DatabaseProxy;
  cluster: rds.DatabaseCluster;
  dbName: string;
}

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { vpc, lambdaSg, proxy, cluster, dbName } = props;

    //
    // 1. Migration
    //
    const migration = new MigrationConstruct(this, "OrdersMigration", {
      vpc,
      lambdaSg,
      proxy,
      cluster,
      dbName
    });

    //
    // 2. Lambda
    //
    const lambda = new LambdaConstruct(this, "OrdersLambda", {
      vpc,
      lambdaSg,
      proxy,
      cluster,
      dbName
    });

    //
    // 3. Cognito
    //
    const cognito = new CognitoConstruct(this, "OrdersCognito");

    //
    // 4. API Gateway
    //
    const api = new ApiConstruct(this, "OrdersApi", {
      ordersFunction: lambda.function,
      userPool: cognito.userPool,
      userPoolClient: cognito.userPoolClient
    });

    //
    // Ensure that always migration runs first, then the new Lambda is deployed
    //
    lambda.node.addDependency(migration);
  }
}