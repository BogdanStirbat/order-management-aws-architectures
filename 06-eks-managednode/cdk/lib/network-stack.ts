import * as cdk from "aws-cdk-lib";
import { Stack, StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import type { OrdersAppConfig } from "./config";

export interface NetworkStackProps extends StackProps {
  config: OrdersAppConfig;
}

export class NetworkStack extends Stack {
  public readonly vpc: ec2.Vpc;

  public readonly publicSubnets: ec2.ISubnet[];
  public readonly appSubnets: ec2.ISubnet[];
  public readonly dbSubnets: ec2.ISubnet[];

  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, "OrdersAppVpc", {
      vpcName: "orders-app-eks-vpc",
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: 2,
      natGateways:  2,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "app",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: "db",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    this.publicSubnets = this.vpc.selectSubnets({ subnetGroupName: "public" }).subnets;
    this.appSubnets = this.vpc.selectSubnets({ subnetGroupName: "app" }).subnets;
    this.dbSubnets = this.vpc.selectSubnets({ subnetGroupName: "db" }).subnets;

    // Security Groups
    this.albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc: this.vpc,
      securityGroupName: "orders-app-sg-alb",
      description: "ALB security group for orders app",
    });

    this.dbSecurityGroup = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc: this.vpc,
      securityGroupName: "orders-app-sg-db",
      description: "DB SG: allow inbound from EKS nodes/pods on 5432",
    });

    // Ingress Rules
    // in order to configure HTTPS, the clients must provide a custom DNS + custom TLS certificate
    // since no managed TLS certificate is provided for the ALB-provided DNS name
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP from clients on the internet'
    );

    this.vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetGroupName: "app" }]
    });

    new cdk.CfnOutput(this, "VpcId", { value: this.vpc.vpcId });
  }
}
