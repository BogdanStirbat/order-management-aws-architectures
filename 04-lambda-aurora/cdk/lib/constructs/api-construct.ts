import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";

export interface ApiConstructProps {
  ordersFunction: lambda.IFunction;
}

export class ApiConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    const api = new apigw.RestApi(this, "OrdersRestApi", {
      restApiName: "orders-lambda-api",
      deployOptions: {
        stageName: "prod",
        metricsEnabled: true,
        loggingLevel: apigw.MethodLoggingLevel.INFO
      }
    });

    const integration = new apigw.LambdaIntegration(props.ordersFunction, {
      proxy: true
    });

    api.root.addMethod("ANY", integration);

    const proxy = api.root.addResource("{proxy+}");
    proxy.addMethod("ANY", integration);

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url
    });
  }
}