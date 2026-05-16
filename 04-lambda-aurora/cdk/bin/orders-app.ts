#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { loadConfig } from "../lib/config";
import { NetworkStack } from "../lib/network-stack";
import { DatabaseStack } from "../lib/database-stack";
import { MigrationStack } from "../lib/migration-stack";
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

const network = new NetworkStack(app, "OrdersApp-Network", { env });

const database = new DatabaseStack(app, "OrdersApp-Database", {
  env,
  vpc: network.vpc,
  dbSg: network.dbSg,
  proxySg: network.proxySg,
  config
});

const migration = new MigrationStack(app, "OrdersApp-Migration", {
  env,
  vpc: network.vpc,
  migrationTaskSg: network.migrationTaskSg,
  proxy: database.proxy,
  cluster: database.cluster,
  dbName: database.dbName,
});

const lambda = new LambdaStack(app, "OrdersApp-Lambda", {
  env,
  vpc: network.vpc,
  lambdaSg: network.lambdaSg,
  proxy: database.proxy,
  cluster: database.cluster,
  dbName: database.dbName,
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
  dbCluster: database.cluster,
  dbProxy: database.proxy,
  migrationCluster: migration.cluster,
  migrationTaskFamily: "orders-db-migration",
  config,
});

database.addDependency(network);
migration.addDependency(database);
lambda.addDependency(database);
api.addDependency(lambda);
api.addDependency(cognito);
monitoring.addDependency(api);
monitoring.addDependency(lambda);
monitoring.addDependency(database);
monitoring.addDependency(migration);