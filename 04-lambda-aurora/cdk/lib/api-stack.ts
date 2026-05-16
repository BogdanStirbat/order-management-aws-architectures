import * as cdk from "aws-cdk-lib";
import { Stack, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";

import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as logs from "aws-cdk-lib/aws-logs";

export interface ApiStackProps extends StackProps {
  ordersFunction: lambda.IFunction;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
}

export class ApiStack extends Stack {
  public readonly accessLogGroup: logs.LogGroup;
  public readonly httpApi: apigwv2.HttpApi;
  public readonly defaultStage: apigwv2.HttpStage;

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

    this.accessLogGroup = new logs.LogGroup(this, "HttpApiAccessLogGroup", {
      logGroupName: `/aws/apigateway/${this.stackName}/access`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY, // dev-friendly
    });

    this.httpApi = new apigwv2.HttpApi(this, "OrdersHttpApi", {
      apiName: "orders-lambda-api",
      createDefaultStage: true,
    });

    const routeOptions = {
      methods: [apigwv2.HttpMethod.ANY],
      integration,
      authorizer,
    };

    this.httpApi.addRoutes({
      path: "/",
      ...routeOptions,
    });

    this.httpApi.addRoutes({
      path: "/{proxy+}",
      ...routeOptions,
    });

    this.defaultStage = this.httpApi.addStage("DefaultStage", {
      stageName: "$default",
      autoDeploy: true,
      accessLogSettings: {
        destination: new apigwv2.LogGroupLogDestination(this.accessLogGroup),
        format: apigw.AccessLogFormat.custom(JSON.stringify({
          requestId: "$context.requestId",
          ip: "$context.identity.sourceIp",
          requestTime: "$context.requestTime",
          httpMethod: "$context.httpMethod",
          routeKey: "$context.routeKey",
          path: "$context.path",
          status: "$context.status",
          protocol: "$context.protocol",
          responseLength: "$context.responseLength",

          authorizerError: "$context.authorizer.error",

          jwtSub: "$context.authorizer.jwt.claims.sub",
          jwtClientId: "$context.authorizer.jwt.claims.client_id",
          jwtTokenUse: "$context.authorizer.jwt.claims.token_use",
          jwtScope: "$context.authorizer.jwt.claims.scope",

          integrationStatus: "$context.integration.integrationStatus",
          integrationLatencyMs: "$context.integration.latency",
          awsEndpointRequestId: "$context.integration.requestId",
          integrationError: "$context.integration.error",
          integrationErrorMessage: "$context.integrationErrorMessage"
        })),
      },
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: this.httpApi.apiEndpoint,
    });
  }
}