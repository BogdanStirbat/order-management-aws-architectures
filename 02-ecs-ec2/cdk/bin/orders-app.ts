#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { loadConfig } from "../lib/config";
import { EcrRepositoryStack } from "../lib/ecr-repository-stack";
import { NetworkStack } from "../lib/network-stack";
import { DatabaseStack } from "../lib/database-stack";
import { AlbStack } from "../lib/alb-stack";
import { EcsStack } from "../lib/ecs-stack";

const app = new cdk.App();
const config = loadConfig(app);

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
};

const ecrRepository = new EcrRepositoryStack(app, "OrdersApp-EcrRepository", {
  env,
  config
});

const network = new NetworkStack(app, "OrdersApp-Network", { env });

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
  publicSubnets: network.publicSubnets,
  albSecurityGroup: network.albSecurityGroup,
  config
});

const ecs = new EcsStack(app, "OrdersApp-Ecs", {
  env,
  vpc: network.vpc,
  appSubnets: network.appSubnets,
  ecsSecurityGroup: network.ecsSecurityGroup,
  dbSecret: database.secret,
  db: database.db,
  repository: ecrRepository.repository,
  targetGroup: alb.targetGroup,
  config
});
