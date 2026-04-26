#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { OrdersLambdaStack } from "../lib/orders-lambda-stack";

const app = new cdk.App();

new OrdersLambdaStack(app, "OrdersLambdaStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});