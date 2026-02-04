import * as cdk from "aws-cdk-lib";
import { Stack, StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export class NetworkStack extends Stack {
  public readonly vpc: ec2.Vpc;

  public readonly publicSubnets: ec2.ISubnet[];
  public readonly appSubnets: ec2.ISubnet[];
  public readonly dbSubnets: ec2.ISubnet[];

  public readonly vpcLinkSecurityGroup: ec2.SecurityGroup;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly appSecurityGroup: ec2.SecurityGroup;
  public readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // - Public subnets (ALB, NAT)
    // - Private subnets with egress (App instances)
    // - Isolated subnets (DB)
    this.vpc = new ec2.Vpc(this, "OrdersAppVpc", {
      vpcName: "orders-app-vpc-01",
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: 2,
      natGateways: 2,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24
        },
        {
          name: "app",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24
        },
        {
          name: "db",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24
        }
      ]
    });

    this.publicSubnets = this.vpc.selectSubnets({ subnetGroupName: "public" }).subnets;
    this.appSubnets = this.vpc.selectSubnets({ subnetGroupName: "app" }).subnets;
    this.dbSubnets = this.vpc.selectSubnets({ subnetGroupName: "db" }).subnets;

    // Security Groups
    this.vpcLinkSecurityGroup = new ec2.SecurityGroup(this, "VpcLinkSg", {
      vpc: this.vpc,
      securityGroupName: "orders-app-sg-vpclink",
      description: "SG used by API Gateway VPC Link ENIs"
    });

    this.albSecurityGroup = new ec2.SecurityGroup(this, "AlbSg", {
      vpc: this.vpc,
      securityGroupName: "orders-app-sg-alb",
      description: "ALB security group for orders app"
    });

    this.appSecurityGroup = new ec2.SecurityGroup(this, "AppSg", {
      vpc: this.vpc,
      securityGroupName: "orders-app-sg-app",
      description: "App security group (shared) for orders app"
    });

    this.dbSecurityGroup = new ec2.SecurityGroup(this, "DbSg", {
      vpc: this.vpc,
      securityGroupName: "orders-app-sg-db",
      description: "DB security group (shared) for orders app"
    });

    // Ingress Rules
    this.albSecurityGroup.addIngressRule(
      this.vpcLinkSecurityGroup,
      ec2.Port.tcp(80),
      "HTTP from API Gateway VPC Link"
    );

    this.appSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcp(8080),
      "App port from ALB"
    );

    this.dbSecurityGroup.addIngressRule(
      this.appSecurityGroup,
      ec2.Port.tcp(5432),
      "Postgres from app"
    );

    new cdk.CfnOutput(this, "VpcId", { value: this.vpc.vpcId });
  }
}
