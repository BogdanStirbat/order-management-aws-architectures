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
  public readonly appSubnets: ec2.ISubnet[];
  public readonly dbSubnets: ec2.ISubnet[];

  public readonly vpcLinkSecurityGroup: ec2.SecurityGroup;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly dbSecurityGroup: ec2.SecurityGroup;
  public readonly endpointsSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const appSubnetType = props.config.useNatGateway
      ? ec2.SubnetType.PRIVATE_WITH_EGRESS
      : ec2.SubnetType.PRIVATE_ISOLATED;

    this.vpc = new ec2.Vpc(this, "OrdersAppVpc", {
      vpcName: "orders-app-eks-vpc",
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: 2,
      natGateways: props.config.useNatGateway ? 1 : 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "app",
          subnetType: appSubnetType,
          cidrMask: 24,
        },
        {
          name: "db",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    this.appSubnets = this.vpc.selectSubnets({ subnetGroupName: "app" }).subnets;
    this.dbSubnets = this.vpc.selectSubnets({ subnetGroupName: "db" }).subnets;

    this.vpcLinkSecurityGroup = new ec2.SecurityGroup(this, "VpcLinkSg", {
      vpc: this.vpc,
      securityGroupName: "orders-app-sg-vpclink",
      description: "SG used by API Gateway VPC Link ENIs",
    });

    this.albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc: this.vpc,
      securityGroupName: "orders-app-sg-alb",
      description: "Private ALB security group for orders app",
    });

    this.dbSecurityGroup = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc: this.vpc,
      securityGroupName: "orders-app-sg-db",
      description: "DB SG: allow inbound from EKS nodes/pods on 5432",
    });

    this.endpointsSg = new ec2.SecurityGroup(this, "EndpointsSg", {
      vpc: this.vpc,
      securityGroupName: "orders-app-sg-endpoints",
      description: "SG for VPC Interface Endpoints",
    });

    this.albSecurityGroup.addIngressRule(
      this.vpcLinkSecurityGroup,
      ec2.Port.tcp(80),
      "HTTP from API Gateway VPC Link",
    );

    this.vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetGroupName: "app" }],
    });

    const interfaceEndpoints = [
      ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      ec2.InterfaceVpcEndpointAwsService.ECR,
      ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_MONITORING,
      ec2.InterfaceVpcEndpointAwsService.KMS,
      ec2.InterfaceVpcEndpointAwsService.STS,
      ec2.InterfaceVpcEndpointAwsService.COGNITO_IDP,
      ec2.InterfaceVpcEndpointAwsService.XRAY,
      ec2.InterfaceVpcEndpointAwsService.EC2,
      ec2.InterfaceVpcEndpointAwsService.EKS,
      ec2.InterfaceVpcEndpointAwsService.ELASTIC_LOAD_BALANCING,
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
