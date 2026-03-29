import * as cdk from "aws-cdk-lib";
import { Stack, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import type { OrdersAppConfig } from "./config";

export interface AlbStackProps extends StackProps {
  vpc: ec2.IVpc;
  appSubnets: ec2.ISubnet[];
  albSecurityGroup: ec2.ISecurityGroup;
  config: OrdersAppConfig;
}

export class AlbStack extends Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  public readonly httpListener: elbv2.ApplicationListener;
  public readonly accessLogsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: AlbStackProps) {
    super(scope, id, props);

    const { vpc, appSubnets, albSecurityGroup, config } = props;

    this.accessLogsBucket = new s3.Bucket(this, "AlbAccessLogsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: RemovalPolicy.DESTROY, // dev-friendly
      autoDeleteObjects: true, // dev-friendly
    });

    this.alb = new elbv2.ApplicationLoadBalancer(this, "OrdersAlb", {
      loadBalancerName: "orders-app-alb",
      vpc,
      internetFacing: false,
      vpcSubnets: { subnets: appSubnets },
      securityGroup: albSecurityGroup
    });

    this.alb.logAccessLogs(
      this.accessLogsBucket,
      "alb-access"
    );

    this.targetGroup = new elbv2.ApplicationTargetGroup(this, "OrdersTg", {
      targetGroupName: "orders-app-tg",
      vpc,
      port: config.appPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      deregistrationDelay: cdk.Duration.seconds(60),
      healthCheck: {
        enabled: true,
        path: config.healthCheckPath,
        healthyHttpCodes: "200-399"
      }
    });

    this.httpListener = this.alb.addListener("HttpListener", {
      port: 80,
      open: false,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [this.targetGroup]
    });

    const webAcl = new wafv2.CfnWebACL(this, "OrdersAlbWebAcl", {
      scope: "REGIONAL",
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "orders-alb-webacl",
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
              limit: 300,
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

    new wafv2.CfnWebACLAssociation(this, "OrdersAlbWebAclAssociation", {
      resourceArn: this.alb.loadBalancerArn,
      webAclArn: webAcl.attrArn,
    });

    new cdk.CfnOutput(this, "AlbDnsName", { value: this.alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, "TargetGroupArn", { value: this.targetGroup.targetGroupArn });
    new cdk.CfnOutput(this, "AlbAccessLogsBucketName", {
      value: this.accessLogsBucket.bucketName,
    });
  }
}