import * as cdk from "aws-cdk-lib";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export class NetworkStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly lambdaSg: ec2.SecurityGroup;
  public readonly proxySg: ec2.SecurityGroup;
  public readonly dbSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, "OrdersVpc", {
      vpcName: "orders-lambda-vpc",
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24
        }
      ]
    });

    this.lambdaSg = new ec2.SecurityGroup(this, "LambdaSg", {
      vpc: this.vpc,
      description: "Security group for Orders Lambda"
    });

    this.proxySg = new ec2.SecurityGroup(this, "RdsProxySg", {
      vpc: this.vpc,
      description: "Security group for RDS Proxy"
    });

    this.dbSg = new ec2.SecurityGroup(this, "AuroraSg", {
      vpc: this.vpc,
      description: "Security group for Aurora PostgreSQL"
    });

    this.proxySg.addIngressRule(
      this.lambdaSg,
      ec2.Port.tcp(5432),
      "PostgreSQL from Lambda"
    );

    this.dbSg.addIngressRule(
      this.proxySg,
      ec2.Port.tcp(5432),
      "PostgreSQL from RDS Proxy"
    );

    new cdk.CfnOutput(this, "VpcId", {
      value: this.vpc.vpcId
    });
  }
}