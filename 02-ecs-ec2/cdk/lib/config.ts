import * as cdk from "aws-cdk-lib";

const ALLOWED_DB_ENGINE_VERSIONS = ["16.9", "16.8", "17.6", "17.7"] as const;
type DbEngineVersion = typeof ALLOWED_DB_ENGINE_VERSIONS[number];

export type OrdersAppConfig = {
  ecrRepositoryName: string;

  dbName: string;
  dbEngineVersion: "16.9" | "16.8" | "17.6" | "17.7";
  dbInstanceClass: string; // "t4g.micro" or "t3.micro", defaults to "t4g.micro"
  dbAllocatedStorageGb: number;
  dbBackupRetentionDays: number;
  dbDeletionProtection: boolean;

  ecsClusterName: string; 

  ec2InstanceType: string;

  asgMinCapacity: number;
  asgMaxCapacity: number;
  asgDesiredCapacity: number;

  ec2ServiceMinCapacity: number;
  ec2ServiceMaxCapacity: number;
  ec2ServiceCpuTargetUtilizationPercent: number;
  ec2ServiceMemoryTargetUtilizationPercent: number;

  imageTag: string;

  containerMemoryReservationMB: number;

  appPort: number;
  healthCheckPath: string;

  ec2ServiceDesiredCount: number;
  ec2ServiceHealthCheckGracePeriodSeconds: number;

  alarmEmail?: string;
};

function optionalString(app: cdk.App, key: string, def: string): string {
  const v = app.node.tryGetContext(key);
  if (v === undefined || v === null) return def;
  if (typeof v !== "string") throw new Error(`Context ${key} must be a string`);
  return v;
}

function nullableString(app: cdk.App, key: string): string | undefined {
  const v = app.node.tryGetContext(key);
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new Error(`Context ${key} must be a string`);
  return v;
}

function optionalNumber(app: cdk.App, key: string, def: number): number {
  const v = app.node.tryGetContext(key);
  if (v === undefined || v === null) return def;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Context ${key} must be a number (got ${v})`);
  return n;
}

function optionalBool(app: cdk.App, key: string, def: boolean): boolean {
  const v = app.node.tryGetContext(key);
  if (v === undefined || v === null) return def;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  throw new Error(`Context ${key} must be a boolean (true/false)`);
}

function optionalDbEngineVersion(
  app: cdk.App,
  key: string,
  def: DbEngineVersion
): DbEngineVersion {
  const v = app.node.tryGetContext(key);

  if (v === undefined || v === null) {
    return def;
  }

  if (typeof v !== "string") {
    throw new Error(`Context ${key} must be a string`);
  }

  if (!ALLOWED_DB_ENGINE_VERSIONS.includes(v as DbEngineVersion)) {
    throw new Error(
      `Invalid ${key}: "${v}". Allowed values: ${ALLOWED_DB_ENGINE_VERSIONS.join(", ")}`
    );
  }

  return v as DbEngineVersion;
}

export function loadConfig(app: cdk.App): OrdersAppConfig {

  return {
    ecrRepositoryName: optionalString(app, "ecrRepositoryName", "orders-app-ecsec2"),

    dbName: optionalString(app, "dbName", "ordersdb"),
    dbEngineVersion: optionalDbEngineVersion(app, "dbEngineVersion", "16.9"),
    dbInstanceClass: optionalString(app, "dbInstanceClass", "t4g.micro"),
    dbAllocatedStorageGb: optionalNumber(app, "dbAllocatedStorageGb", 20),
    dbBackupRetentionDays: optionalNumber(app, "dbBackupRetentionDays", 7),
    dbDeletionProtection: optionalBool(app, "dbDeletionProtection", false), // dev-frendly 

    ecsClusterName: optionalString(app, "ecsClusterName", "ecsec2-cluster"),

    ec2InstanceType: optionalString(app, "ec2InstanceType", "t3.medium"),

    asgMinCapacity: optionalNumber(app, "asgMinCapacity", 2),
    asgMaxCapacity: optionalNumber(app, "asgMaxCapacity", 4),
    asgDesiredCapacity: optionalNumber(app, "asgDesiredCapacity", 2),

    ec2ServiceMinCapacity: optionalNumber(app, "ec2ServiceMinCapacity", 2),
    ec2ServiceMaxCapacity: optionalNumber(app, "ec2ServiceMaxCapacity", 4),
    ec2ServiceCpuTargetUtilizationPercent: optionalNumber(app, "ec2ServiceCpuTargetUtilizationPercent", 70),
    ec2ServiceMemoryTargetUtilizationPercent: optionalNumber(app, "ec2ServiceMemoryTargetUtilizationPercent", 75),

    imageTag: optionalString(app, "imageTag", "latest"),

    containerMemoryReservationMB: optionalNumber(app, "containerMemoryReservationMB", 1024),

    appPort: optionalNumber(app, "appPort", 8080),
    healthCheckPath: optionalString(app, "healthCheckPath", "/actuator/health/readiness"),

    ec2ServiceDesiredCount: optionalNumber(app, "ec2ServiceDesiredCount", 2),
    ec2ServiceHealthCheckGracePeriodSeconds: optionalNumber(app, "ec2ServiceHealthCheckGracePeriodSeconds", 300),

    /**
     * Optional email for alarm notifications.
     * Example: cdk deploy -c alarmEmail=you@example.com
     * 
     */
    alarmEmail: nullableString(app, "alarmEmail"),
  }
}
