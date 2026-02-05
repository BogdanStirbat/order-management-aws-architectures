#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { AmiBuilderStack } from "../lib/ami-builder-stack";
import { DatabaseStack } from "../lib/database-stack";
import { AlbStack } from "../lib/alb-stack";
import { CognitoStack } from "../lib/cognito-stack";
import { ApiStack } from "../lib/api-stack";
import { MonitoringStack } from "../lib/monitoring-stack";
import { ComputeStack } from "../lib/compute-stack";
import { loadConfig } from "../lib/config";

const app = new cdk.App();
const config = loadConfig(app);

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
};

const network = new NetworkStack(app, "OrdersApp-Network", { env });

const amiBuilder = new AmiBuilderStack(app, "OrdersApp-AmiBuilder", {
  env,
  vpc: network.vpc,
  buildSubnet: network.publicSubnets[0],
});

const database = new DatabaseStack(app, "OrdersApp-Database", {
  env,
  vpc: network.vpc,
  dbSubnets: network.dbSubnets,
  dbSecurityGroup: network.dbSecurityGroup,
  config
});

const alb = new AlbStack(app, "OrdersApp-Alb", {
  env,
  vpc: network.vpc,
  appSubnets: network.appSubnets,
  albSecurityGroup: network.albSecurityGroup,
  config
});

const cognito = new CognitoStack(app, "OrdersApp-Cognito", { env });

new ApiStack(app, "OrdersApp-Api", {
  env,
  vpc: network.vpc,
  appSubnets: network.appSubnets,
  vpcLinkSecurityGroup: network.vpcLinkSecurityGroup,
  albListener: alb.httpListener, // expose listener from AlbStack
  userPool: cognito.userPool,
  userPoolClient: cognito.userPoolClient,
});

new MonitoringStack(app, "OrdersApp-Monitoring", {
  env,
  targetGroup: alb.targetGroup,
  db: database.db,
  alarmEmail: config.alarmEmail,
});

new ComputeStack(app, "OrdersApp-Compute", {
  env,
  vpc: network.vpc,
  appSubnets: network.appSubnets,
  appSecurityGroup: network.appSecurityGroup,
  targetGroup: alb.targetGroup,
  database,
  config,
  jarKey: config.jarKey,
  cognitoIssuerUri: cognito.issuerUri,
  cognitoAudience: cognito.audience
});
