import * as cdk from "aws-cdk-lib";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
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

  constructor(scope: Construct, id: string, props: AlbStackProps) {
    super(scope, id, props);

    const { vpc, appSubnets, albSecurityGroup, config } = props;

    this.alb = new elbv2.ApplicationLoadBalancer(this, "OrdersAlb", {
      loadBalancerName: "orders-app-alb",
      vpc,
      internetFacing: false,
      vpcSubnets: { subnets: appSubnets },
      securityGroup: albSecurityGroup
    });

    this.targetGroup = new elbv2.ApplicationTargetGroup(this, "OrdersTg", {
      targetGroupName: "orders-app-tg",
      vpc,
      port: config.appPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.INSTANCE,
      healthCheck: {
        enabled: true,
        path: config.healthCheckPath,
        healthyHttpCodes: "200-399"
      }
    });

    this.httpListener = this.alb.addListener("HttpListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [this.targetGroup]
    });

    // ---- WAF (Web ACL) ----
    // Attach WAF to the ALB.
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

    new wafv2.CfnWebACLAssociation(this, "OrdersAlbWebAclAssociation", {
      resourceArn: this.alb.loadBalancerArn,
      webAclArn: webAcl.attrArn,
    });

    new cdk.CfnOutput(this, "AlbDnsName", { value: this.alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, "TargetGroupArn", { value: this.targetGroup.targetGroupArn });
  }
}
