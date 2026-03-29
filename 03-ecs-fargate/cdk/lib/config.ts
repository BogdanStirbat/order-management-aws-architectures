import * as cdk from "aws-cdk-lib";

const ALLOWED_DB_ENGINE_VERSIONS = ["16.9", "16.8", "17.6", "17.7"] as const;
type DbEngineVersion = typeof ALLOWED_DB_ENGINE_VERSIONS[number];

export type OrdersAppConfig = {
  appEcrRepositoryName: string;
  adotEcrRepositoryName: string;

  dbName: string;
  dbEngineVersion: "16.9" | "16.8" | "17.6" | "17.7";
  dbInstanceClass: string; // "t4g.micro" or "t3.micro", defaults to "t4g.micro"
  dbAllocatedStorageGb: number;
  dbBackupRetentionDays: number;
  dbDeletionProtection: boolean;

  ecsClusterName: string; 

  fargateTaskCpu: number;
  fargateTaskMemoryMiB: number;

  adotMemoryReservationMB: number;
  adotMemoryLimitMiB: number;

  fargateServiceMinCapacity: number;
  fargateServiceMaxCapacity: number;
  fargateServiceCpuTargetUtilizationPercent: number;
  fargateServiceMemoryTargetUtilizationPercent: number;

  appImageTag: string;
  adotImageTag: string;

  containerMemoryReservationMB: number;

  appPort: number;
  healthCheckPath: string;

  fargateServiceDesiredCount: number;
  fargateServiceHealthCheckGracePeriodSeconds: number;

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
    appEcrRepositoryName: optionalString(app, "appEcrRepositoryName", "orders-app-ecsec2"),
    adotEcrRepositoryName: optionalString(app, "adotEcrRepositoryName", "adot"),

    dbName: optionalString(app, "dbName", "ordersdb"),
    dbEngineVersion: optionalDbEngineVersion(app, "dbEngineVersion", "16.9"),
    dbInstanceClass: optionalString(app, "dbInstanceClass", "t4g.micro"),
    dbAllocatedStorageGb: optionalNumber(app, "dbAllocatedStorageGb", 20),
    dbBackupRetentionDays: optionalNumber(app, "dbBackupRetentionDays", 7),
    dbDeletionProtection: optionalBool(app, "dbDeletionProtection", false), // dev-frendly 

    ecsClusterName: optionalString(app, "ecsClusterName", "fargate-cluster"),

    fargateTaskCpu: optionalNumber(app, "fargateTaskCpu", 512),
    fargateTaskMemoryMiB: optionalNumber(app, "fargateTaskMemoryMiB", 2048),

    adotMemoryReservationMB: optionalNumber(app, "adotMemoryReservationMB", 512),
    adotMemoryLimitMiB: optionalNumber(app, "adotMemoryLimitMiB", 1024),

    fargateServiceMinCapacity: optionalNumber(app, "fargateServiceMinCapacity", 2),
    fargateServiceMaxCapacity: optionalNumber(app, "fargateServiceMaxCapacity", 4),
    fargateServiceCpuTargetUtilizationPercent: optionalNumber(app, "fargateServiceCpuTargetUtilizationPercent", 70),
    fargateServiceMemoryTargetUtilizationPercent: optionalNumber(app, "fargateServiceMemoryTargetUtilizationPercent", 75),

    appImageTag: optionalString(app, "appImageTag", "latest"),
    adotImageTag: optionalString(app, "adotImageTag", "latest"),

    containerMemoryReservationMB: optionalNumber(app, "containerMemoryReservationMB", 1024),

    appPort: optionalNumber(app, "appPort", 8080),
    healthCheckPath: optionalString(app, "healthCheckPath", "/actuator/health/readiness"),

    fargateServiceDesiredCount: optionalNumber(app, "fargateServiceDesiredCount", 2),
    fargateServiceHealthCheckGracePeriodSeconds: optionalNumber(app, "fargateServiceHealthCheckGracePeriodSeconds", 300),

    /**
     * Optional email for alarm notifications.
     * Example: cdk deploy -c alarmEmail=you@example.com
     * 
     */
    alarmEmail: nullableString(app, "alarmEmail"),
  }
}
