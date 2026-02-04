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
  public readonly endpointsSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // - Public subnets (ALB, NAT)
    // - Private subnets with egress (App instances)
    // - Isolated subnets (DB)
    this.vpc = new ec2.Vpc(this, "OrdersAppVpc", {
      vpcName: "orders-app-vpc-01",
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24
        },
        {
          name: "app",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
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

    this.endpointsSg = new ec2.SecurityGroup(this, "EndpointsSg", {
      vpc: this.vpc,
      securityGroupName: "orders-app-sg-endpoints",
      description: "SG for VPC Interface Endpoints"
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

    this.endpointsSg.addIngressRule(
      this.appSecurityGroup,
      ec2.Port.tcp(443),
      "HTTPS from app instances"
    );

    // Gateway VPC endpoint for S3 (removes S3 traffic from NAT)
    this.vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetGroupName: "app" }], // app subnets can reach S3 without NAT
    });

    const interfaceEndpoints = [
      ec2.InterfaceVpcEndpointAwsService.SSM,
      ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,

      ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,

      ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_MONITORING,

      // Optional but often useful:
      ec2.InterfaceVpcEndpointAwsService.KMS,
      ec2.InterfaceVpcEndpointAwsService.STS,
    ];

    for (const svc of interfaceEndpoints) {
      this.vpc.addInterfaceEndpoint(`Endpoint-${svc.shortName}`, {
        service: svc,
        subnets: { subnets: this.appSubnets },
        privateDnsEnabled: true,
        securityGroups: [this.endpointsSg],
      });
    }

    new cdk.CfnOutput(this, "VpcId", { value: this.vpc.vpcId });
  }
}
