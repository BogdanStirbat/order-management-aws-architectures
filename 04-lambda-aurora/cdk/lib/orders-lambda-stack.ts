import * as path from "path";
import * as crypto from "crypto";
import * as fs from "fs";

import * as cdk from "aws-cdk-lib";
import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cr from "aws-cdk-lib/custom-resources";

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

export class OrdersLambdaStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const dbName = "ordersdb";

    const vpc = new ec2.Vpc(this, "OrdersVpc", {
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

    const lambdaSg = new ec2.SecurityGroup(this, "LambdaSg", {
      vpc,
      description: "Security group for Orders Lambda"
    });

    const proxySg = new ec2.SecurityGroup(this, "RdsProxySg", {
      vpc,
      description: "Security group for RDS Proxy"
    });

    const dbSg = new ec2.SecurityGroup(this, "AuroraSg", {
      vpc,
      description: "Security group for Aurora PostgreSQL"
    });

    proxySg.addIngressRule(lambdaSg, ec2.Port.tcp(5432), "PostgreSQL from Lambda");
    dbSg.addIngressRule(proxySg, ec2.Port.tcp(5432), "PostgreSQL from RDS Proxy");

    const cluster = new rds.DatabaseCluster(this, "OrdersAuroraCluster", {
      clusterIdentifier: "orders-aurora-serverless-v2",
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4
      }),
      credentials: rds.Credentials.fromGeneratedSecret("postgres", {
        secretName: "orders-lambda/aurora/postgres"
      }),
      defaultDatabaseName: dbName,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      securityGroups: [dbSg],
      writer: rds.ClusterInstance.serverlessV2("writer"),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 2,
      backup: {
        retention: Duration.days(7)
      },
      storageEncrypted: true,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const proxy = new rds.DatabaseProxy(this, "OrdersRdsProxy", {
      proxyTarget: rds.ProxyTarget.fromCluster(cluster),
      dbProxyName: "orders-rds-proxy",
      secrets: [cluster.secret!],
      vpc,
      securityGroups: [proxySg],
      requireTLS: true,
      iamAuth: false,
      debugLogging: false
    });

    const ordersFunction = new lambda.Function(this, "OrdersApiFunction", {
      functionName: "orders-api-lambda",
      runtime: lambda.Runtime.JAVA_21,
      architecture: lambda.Architecture.ARM_64,
      handler: "com.order.management.orderslambda.OrdersApiHandler::handleRequest",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../orders-lambda/target/orders-lambda-1.0.0.jar")
      ),
      memorySize: 1024,
      timeout: Duration.seconds(30),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      securityGroups: [lambdaSg],
      environment: {
        DB_HOST: proxy.endpoint,
        DB_PORT: "5432",
        DB_NAME: dbName,
        DB_USERNAME: "postgres",
        DB_PASSWORD: cluster.secret!.secretValueFromJson("password").unsafeUnwrap()
      },
      logRetention: logs.RetentionDays.ONE_WEEK
    });

    cluster.secret!.grantRead(ordersFunction);

    const api = new apigw.RestApi(this, "OrdersRestApi", {
      restApiName: "orders-lambda-api",
      deployOptions: {
        stageName: "prod",
        metricsEnabled: true,
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        dataTraceEnabled: false
      }
    });

    const lambdaIntegration = new apigw.LambdaIntegration(ordersFunction, {
      proxy: true
    });

    api.root.addMethod("ANY", lambdaIntegration);

    const proxyResource = api.root.addResource("{proxy+}");
    proxyResource.addMethod("ANY", lambdaIntegration);

    const migrationDir = path.join(__dirname, "../migration");
    const migrations = loadMigrations(migrationDir);

    const migrationsJson = JSON.stringify(migrations);

    const migrationsHash = crypto
      .createHash("sha256")
      .update(migrationsJson)
      .digest("hex");

    const migrationFunction = new lambdaNodejs.NodejsFunction(this, "MigrationFunction", {
      functionName: "orders-db-migration-custom-resource",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: path.join(__dirname, "../custom-resource/migration-handler.ts"),
      handler: "handler",
      timeout: Duration.minutes(2),
      memorySize: 256,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      securityGroups: [lambdaSg],
      bundling: {
        externalModules: [],
        nodeModules: ["pg", "@aws-sdk/client-secrets-manager"]
      },
      logRetention: logs.RetentionDays.ONE_WEEK
    });

    cluster.secret!.grantRead(migrationFunction);

    const migrationProvider = new cr.Provider(this, "MigrationProvider", {
      onEventHandler: migrationFunction,
      logRetention: logs.RetentionDays.ONE_WEEK
    });

    const migration = new cdk.CustomResource(this, "OrdersDbMigration", {
      serviceToken: migrationProvider.serviceToken,
      properties: {
        SecretArn: cluster.secret!.secretArn,
        DbHost: proxy.endpoint,
        DbPort: "5432",
        DbName: dbName,
        MigrationsJson: migrationsJson,
        MigrationsHash: migrationsHash
      }
    });

    migration.node.addDependency(cluster);
    migration.node.addDependency(proxy);

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url
    });

    new cdk.CfnOutput(this, "RdsProxyEndpoint", {
      value: proxy.endpoint
    });

    new cdk.CfnOutput(this, "AuroraSecretArn", {
      value: cluster.secret!.secretArn
    });
  }
}