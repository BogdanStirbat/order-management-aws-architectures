#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { loadConfig } from "../lib/config";
import { DynamoDbStack } from "../lib/dynamodb-stack";
import { LambdaStack } from "../lib/lambda-stack";
import { CognitoStack } from "../lib/cognito-stack";
import { ApiStack } from "../lib/api-stack";
import { MonitoringStack } from "../lib/monitoring-stack";

const app = new cdk.App();
const config = loadConfig(app);

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
};

const dynamoDb = new DynamoDbStack(app, "OrdersApp-DynamoDB", {
  env
})

const lambda = new LambdaStack(app, "OrdersApp-Lambda", {
  env,
  ordersTable: dynamoDb.table,
  config
});

const cognito = new CognitoStack(app, "OrdersApp-Cognito", {
  env,
});

const api = new ApiStack(app, "OrdersApp-Api", {
  env,
  ordersFunction: lambda.ordersAlias,
  userPool: cognito.userPool,
  userPoolClient: cognito.userPoolClient,
});

const monitoring = new MonitoringStack(app, "OrdersApp-Monitoring", {
  env,
  httpApi: api.httpApi,
  apiAccessLogGroup: api.accessLogGroup,
  ordersFunction: lambda.ordersFunction,
  ordersAlias: lambda.ordersAlias,
  ordersTable: dynamoDb.table,
  config,
});


lambda.addDependency(dynamoDb);
api.addDependency(lambda);
api.addDependency(cognito);
monitoring.addDependency(api);