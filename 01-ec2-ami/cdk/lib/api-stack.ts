import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apigwv2Authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as cognito from "aws-cdk-lib/aws-cognito";

export interface ApiStackProps extends StackProps {
  vpc: ec2.IVpc;
  appSubnets: ec2.ISubnet[];
  vpcLinkSecurityGroup: ec2.ISecurityGroup;
  albListener: elbv2.IApplicationListener;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
}

export class ApiStack extends Stack {
  public readonly httpApi: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // VPC Link v2
    const vpcLink = new apigwv2.VpcLink(this, "OrdersVpcLink", {
      vpc: props.vpc,
      subnets: { subnets: props.appSubnets },
      securityGroups: [props.vpcLinkSecurityGroup],
    });

    // Private integration to ALB listener
    const albIntegration = new apigwv2Integrations.HttpAlbIntegration(
      "AlbProxyIntegration",
      props.albListener,
      { vpcLink }
    );

    // JWT authorizer backed by Cognito User Pool
    // Issuer for Cognito user pools is: https://cognito-idp.<region>.amazonaws.com/<userPoolId>
    const issuer = `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`;

    const jwtAuthorizer = new apigwv2Authorizers.HttpJwtAuthorizer(
      "OrdersJwtAuthorizer",
      issuer,
      {
        jwtAudience: [props.userPoolClient.userPoolClientId],
      }
    );

    this.httpApi = new apigwv2.HttpApi(this, "OrdersHttpApi", {
      apiName: "orders-app-http-api",
    });

    // Protect everything by default (proxy-style)
    this.httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration: albIntegration,
      authorizer: jwtAuthorizer,
    });

    // ---- WAF (Web ACL) ----
    // Attach WAF to the API Gateway stage.
    const webAcl = new wafv2.CfnWebACL(this, "OrdersWebAcl", {
      scope: "REGIONAL",
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "orders-webacl",
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: "AWSManagedCommon",
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "aws-common",
            sampledRequestsEnabled: true,
          },
        },
        {
          name: "RateLimit",
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 300, // requests per 5 minutes per IP
              aggregateKeyType: "IP",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "rate-limit",
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // Associate WAF WebACL with the API Gateway stage ARN
    // HTTP API default stage is "$default" unless you create named stages
    const stageArn = `arn:aws:apigateway:${this.region}::/apis/${this.httpApi.apiId}/stages/$default`;

    new wafv2.CfnWebACLAssociation(this, "WebAclAssoc", {
      resourceArn: stageArn,
      webAclArn: webAcl.attrArn,
    });
  }
}
