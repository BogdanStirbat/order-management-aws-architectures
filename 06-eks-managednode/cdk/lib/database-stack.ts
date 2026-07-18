import * as cdk from "aws-cdk-lib";
import { Stack, StackProps, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { OrdersAppConfig } from "./config";

function postgresVersion(version: string): rds.PostgresEngineVersion {
  switch (version) {
    case "16.9": return rds.PostgresEngineVersion.VER_16_9;
    case "16.8": return rds.PostgresEngineVersion.VER_16_8;
    case "17.6": return rds.PostgresEngineVersion.VER_17_6;
    case "17.7": return rds.PostgresEngineVersion.VER_17_7;
    default: throw new Error(`Unsupported Postgres version: ${version}`);
  }
}

export interface DatabaseStackProps extends StackProps {
  vpc: ec2.IVpc;
  dbSubnets: ec2.ISubnet[];
  dbSecurityGroup: ec2.ISecurityGroup;
  config: OrdersAppConfig;
}

export class DatabaseStack extends Stack {
  public readonly db: rds.DatabaseInstance;
  public readonly secret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const dbSecret = new rds.DatabaseSecret(this, "OrdersDbSecret", {
      username: "postgres",
      secretName: "orders-app/rds/postgres-eks",
    });
    this.secret = dbSecret;

    const subnetGroup = new rds.SubnetGroup(this, "DbSubnetGroup", {
      description: "Orders App DB subnets in AZ A/B",
      vpc: props.vpc,
      vpcSubnets: { subnets: props.dbSubnets },
      subnetGroupName: "orders-app-eks-db-subnet-group",
    });

    const instanceType = props.config.dbInstanceClass === "t4g.micro"
      ? ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO)
      : ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO);

    this.db = new rds.DatabaseInstance(this, "OrdersPostgres", {
      databaseName: props.config.dbName,
      instanceIdentifier: "orders-app-eks-postgres",
      engine: rds.DatabaseInstanceEngine.postgres({
        version: postgresVersion(props.config.dbEngineVersion),
      }),
      vpc: props.vpc,
      vpcSubnets: { subnets: props.dbSubnets },
      subnetGroup,
      securityGroups: [props.dbSecurityGroup],
      publiclyAccessible: false,
      credentials: rds.Credentials.fromSecret(dbSecret),
      instanceType,
      multiAz: true,
      allocatedStorage: props.config.dbAllocatedStorageGb,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      backupRetention: Duration.days(props.config.dbBackupRetentionDays),
      copyTagsToSnapshot: true,
      deletionProtection: props.config.dbDeletionProtection,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new cdk.CfnOutput(this, "DbEndpointAddress", { value: this.db.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, "DbEndpointPort", { value: this.db.dbInstanceEndpointPort });
    new cdk.CfnOutput(this, "DbSecretArn", { value: this.secret.secretArn });
  }
}
