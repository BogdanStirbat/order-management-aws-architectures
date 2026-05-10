import * as cdk from "aws-cdk-lib";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as cognito from "aws-cdk-lib/aws-cognito";

export interface ApiStackProps extends StackProps {
  ordersFunction: lambda.IFunction;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
}

export class ApiStack extends Stack {
  public readonly api: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const integration = new integrations.HttpLambdaIntegration(
      "OrdersLambdaIntegration",
      props.ordersFunction,
      {
        payloadFormatVersion: apigwv2.PayloadFormatVersion.VERSION_2_0,
      }
    );

    const authorizer = new authorizers.HttpUserPoolAuthorizer(
      "OrdersCognitoAuthorizer",
      props.userPool,
      {
        userPoolClients: [props.userPoolClient],
        identitySource: ["$request.header.Authorization"],
      }
    );

    this.api = new apigwv2.HttpApi(this, "OrdersHttpApi", {
      apiName: "orders-lambda-api",
    });

    const routeOptions = {
      methods: [apigwv2.HttpMethod.ANY],
      integration,
      authorizer,
    };

    this.api.addRoutes({
      path: "/",
      ...routeOptions,
    });

    this.api.addRoutes({
      path: "/{proxy+}",
      ...routeOptions,
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: this.api.apiEndpoint,
    });
  }
}