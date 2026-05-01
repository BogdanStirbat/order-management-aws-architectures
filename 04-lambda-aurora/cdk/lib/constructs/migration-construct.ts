import * as path from "path";
import * as crypto from "crypto";
import * as fs from "fs";

import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import { Duration } from "aws-cdk-lib";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cr from "aws-cdk-lib/custom-resources";

export interface MigrationConstructProps {
  vpc: ec2.IVpc;
  lambdaSg: ec2.ISecurityGroup;
  proxy: rds.DatabaseProxy;
  cluster: rds.DatabaseCluster;
  dbName: string;
}

type MigrationFile = {
  version: number;
  description: string;
  filename: string;
  sql: string;
  checksum: string;
};

function loadMigrations(migrationDir: string): MigrationFile[] {
  return fs
    .readdirSync(migrationDir)
    .filter((file) => /^V\d+__.+\.sql$/.test(file))
    .map((filename) => {
      const match = filename.match(/^V(\d+)__(.+)\.sql$/);

      if (!match) {
        throw new Error(`Invalid migration filename: ${filename}`);
      }

      const version = Number(match[1]);
      const description = match[2].replace(/_/g, " ");
      const sql = fs.readFileSync(path.join(migrationDir, filename), "utf8");

      const checksum = crypto
        .createHash("sha256")
        .update(sql)
        .digest("hex");

      return {
        version,
        description,
        filename,
        sql,
        checksum
      };
    })
    .sort((a, b) => a.version - b.version);
}

export class MigrationConstruct extends Construct {
  constructor(scope: Construct, id: string, props: MigrationConstructProps) {
    super(scope, id);

    const dir = path.join(__dirname, "../../migration");

    const migrations = loadMigrations(dir);
    const json = JSON.stringify(migrations);
    const hash = crypto.createHash("sha256").update(json).digest("hex");

    const fn = new lambdaNodejs.NodejsFunction(this, "MigrationFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../../custom-resource/migration-handler.ts"),
      handler: "handler",
      timeout: Duration.minutes(2),
      memorySize: 256,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.lambdaSg],
      bundling: {
        nodeModules: ["pg", "@aws-sdk/client-secrets-manager"]
      },
      logRetention: logs.RetentionDays.ONE_WEEK
    });

    props.cluster.secret!.grantRead(fn);

    const provider = new cr.Provider(this, "MigrationProvider", {
      onEventHandler: fn
    });

    const resource = new cdk.CustomResource(this, "MigrationResource", {
      serviceToken: provider.serviceToken,
      properties: {
        SecretArn: props.cluster.secret!.secretArn,
        DbHost: props.proxy.endpoint,
        DbPort: "5432",
        DbName: props.dbName,
        MigrationsJson: json,
        MigrationsHash: hash
      }
    });

    resource.node.addDependency(props.cluster);
    resource.node.addDependency(props.proxy);
  }
}