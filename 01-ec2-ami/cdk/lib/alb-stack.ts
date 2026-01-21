import * as cdk from "aws-cdk-lib";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import type { OrdersAppConfig } from "./config";

export interface AlbStackProps extends StackProps {
  vpc: ec2.IVpc;
  publicSubnets: ec2.ISubnet[];
  albSecurityGroup: ec2.ISecurityGroup;
  config: OrdersAppConfig;
}

export class AlbStack extends Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;

  constructor(scope: Construct, id: string, props: AlbStackProps) {
    super(scope, id, props);

    const { vpc, publicSubnets, albSecurityGroup, config } = props;

    this.alb = new elbv2.ApplicationLoadBalancer(this, "OrdersAlb", {
      loadBalancerName: "orders-app-alb",
      vpc,
      internetFacing: true,
      vpcSubnets: { subnets: publicSubnets },
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

    this.alb.addListener("HttpListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [this.targetGroup]
    });

    new cdk.CfnOutput(this, "AlbDnsName", { value: this.alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, "TargetGroupArn", { value: this.targetGroup.targetGroupArn });
  }
}
