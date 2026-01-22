import * as cdk from "aws-cdk-lib";

const ALLOWED_DB_ENGINE_VERSIONS = ["16.9", "16.8", "17.6", "17.7"] as const;
type DbEngineVersion = typeof ALLOWED_DB_ENGINE_VERSIONS[number];

export type OrdersAppConfig = {
  appJarUrl: string;
  amiId: string;

  instanceType: string;
  desiredCapacity: number;
  minSize: number;
  maxSize: number;

  appPort: number;
  healthCheckPath: string;

  dbName: string;
  dbEngineVersion: "16.9" | "16.8" | "17.6" | "17.7";
  dbInstanceClass: string; // e.g. "t4g.micro"
  dbAllocatedStorageGb: number;
  dbBackupRetentionDays: number;
  dbDeletionProtection: boolean;
};

function requiredString(app: cdk.App, key: string): string {
  const v = app.node.tryGetContext(key);
  if (!v || typeof v !== "string") {
    throw new Error(`Missing required context: ${key}. Provide it via: cdk deploy -c ${key}=...`);
  }
  return v;
}

function optionalString(app: cdk.App, key: string, def: string): string {
  const v = app.node.tryGetContext(key);
  if (v === undefined || v === null) return def;
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
    appJarUrl: requiredString(app, "appJarUrl"),
    amiId: requiredString(app, "amiId"),

    instanceType: optionalString(app, "instanceType", "t3.micro"),
    desiredCapacity: optionalNumber(app, "desiredCapacity", 2),
    minSize: optionalNumber(app, "minSize", 2),
    maxSize: optionalNumber(app, "maxSize", 2),

    appPort: optionalNumber(app, "appPort", 8080),
    healthCheckPath: optionalString(app, "healthCheckPath", "/actuator/health/readiness"),

    dbName: optionalString(app, "dbName", "ordersdb"),
    dbEngineVersion: optionalDbEngineVersion(app, "dbEngineVersion", "16.9"),
    dbInstanceClass: optionalString(app, "dbInstanceClass", "t4g.micro"),
    dbAllocatedStorageGb: optionalNumber(app, "dbAllocatedStorageGb", 20),
    dbBackupRetentionDays: optionalNumber(app, "dbBackupRetentionDays", 7),
    dbDeletionProtection: optionalBool(app, "dbDeletionProtection", true)
  };
}
