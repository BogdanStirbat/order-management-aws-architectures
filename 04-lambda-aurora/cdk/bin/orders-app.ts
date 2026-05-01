#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { DatabaseStack } from "../lib/database-stack";
import { AppStack } from "../lib/app-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
};

const network = new NetworkStack(app, "OrdersApp-Network", { env });

const database = new DatabaseStack(app, "OrdersApp-Database", {
  env,
  vpc: network.vpc,
  dbSg: network.dbSg,
  proxySg: network.proxySg
});

const appStack = new AppStack(app, "OrdersApp-App", {
  env,
  vpc: network.vpc,
  lambdaSg: network.lambdaSg,
  proxy: database.proxy,
  cluster: database.cluster,
  dbName: database.dbName,
});
