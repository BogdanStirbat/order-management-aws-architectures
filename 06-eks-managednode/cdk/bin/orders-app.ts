#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { loadConfig } from "../lib/config";
import { EcrRepositoryStack } from "../lib/ecr-repository-stack";
import { NetworkStack } from "../lib/network-stack";
import { DatabaseStack } from "../lib/database-stack";
import { AlbStack } from "../lib/alb-stack";
import { CognitoStack } from "../lib/cognito-stack";
import { ApiStack } from "../lib/api-stack";
import { EksStack } from "../lib/eks-stack";
import { MonitoringStack } from "../lib/monitoring-stack";

const app = new cdk.App();
const config = loadConfig(app);

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const ecrRepository = new EcrRepositoryStack(app, "OrdersApp-EcrRepository", {
  env,
  config,
});

const network = new NetworkStack(app, "OrdersApp-Network", {
  env,
  config,
});

const database = new DatabaseStack(app, "OrdersApp-Database", {
  env,
  vpc: network.vpc,
  dbSubnets: network.dbSubnets,
  dbSecurityGroup: network.dbSecurityGroup,
  config,
});

const alb = new AlbStack(app, "OrdersApp-Alb", {
  env,
  vpc: network.vpc,
  appSubnets: network.appSubnets,
  albSecurityGroup: network.albSecurityGroup,
  config,
});

const cognito = new CognitoStack(app, "OrdersApp-Cognito", { env });

const api = new ApiStack(app, "OrdersApp-Api", {
  env,
  vpc: network.vpc,
  appSubnets: network.appSubnets,
  vpcLinkSecurityGroup: network.vpcLinkSecurityGroup,
  albListener: alb.httpListener,
  userPool: cognito.userPool,
  userPoolClient: cognito.userPoolClient,
});

const eks = new EksStack(app, "OrdersApp-Eks", {
  env,
  vpc: network.vpc,
  appSubnets: network.appSubnets,
  albSecurityGroup: network.albSecurityGroup,
  dbSecurityGroup: network.dbSecurityGroup,
  endpointsSecurityGroup: network.endpointsSg,
  dbSecret: database.secret,
  db: database.db,
  appRepository: ecrRepository.appRepository,
  adotRepository: ecrRepository.adotRepository,
  targetGroup: alb.targetGroup,
  cognitoIssuerUri: cognito.issuerUri,
  cognitoUserPoolClientId: cognito.userPoolClientId,
  config,
});

new MonitoringStack(app, "OrdersApp-Monitoring", {
  env,
  cluster: eks.cluster,
  alb: alb.alb,
  targetGroup: alb.targetGroup,
  db: database.db,
  httpApi: api.httpApi,
  apiAccessLogGroup: api.accessLogGroup,
  config,
});
