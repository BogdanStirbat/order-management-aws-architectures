import * as cdk from "aws-cdk-lib";

const ALLOWED_DB_ENGINE_VERSIONS = ["16.9", "16.8", "17.6", "17.7"] as const;
type DbEngineVersion = typeof ALLOWED_DB_ENGINE_VERSIONS[number];

export type OrdersAppConfig = {
  appEcrRepositoryName: string;
  adotEcrRepositoryName: string;

  dbName: string;
  dbEngineVersion: DbEngineVersion;
  dbInstanceClass: string;
  dbAllocatedStorageGb: number;
  dbBackupRetentionDays: number;
  dbDeletionProtection: boolean;

  useNatGateway: boolean;

  eksClusterName: string;
  kubernetesVersion: "1.31";
  nodeGroupName: string;
  nodeInstanceType: string;
  nodeGroupMinSize: number;
  nodeGroupDesiredSize: number;
  nodeGroupMaxSize: number;
  nodeDiskSizeGb: number;

  namespace: string;
  appName: string;
  appImageTag: string;
  adotImageTag: string;
  appPort: number;
  healthCheckPath: string;

  podReplicas: number;
  podMinReplicas: number;
  podMaxReplicas: number;
  podCpuRequest: string;
  podCpuLimit: string;
  podMemoryRequest: string;
  podMemoryLimit: string;
  adotCpuRequest: string;
  adotCpuLimit: string;
  adotMemoryRequest: string;
  adotMemoryLimit: string;
  hpaCpuTargetUtilizationPercent: number;

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

function optionalDbEngineVersion(app: cdk.App, key: string, def: DbEngineVersion): DbEngineVersion {
  const v = app.node.tryGetContext(key);
  if (v === undefined || v === null) return def;
  if (typeof v !== "string") throw new Error(`Context ${key} must be a string`);
  if (!ALLOWED_DB_ENGINE_VERSIONS.includes(v as DbEngineVersion)) {
    throw new Error(`Invalid ${key}: "${v}". Allowed values: ${ALLOWED_DB_ENGINE_VERSIONS.join(", ")}`);
  }
  return v as DbEngineVersion;
}

export function loadConfig(app: cdk.App): OrdersAppConfig {
  return {
    appEcrRepositoryName: optionalString(app, "appEcrRepositoryName", "orders-app-eks"),
    adotEcrRepositoryName: optionalString(app, "adotEcrRepositoryName", "orders-app-adot"),

    dbName: optionalString(app, "dbName", "ordersdb"),
    dbEngineVersion: optionalDbEngineVersion(app, "dbEngineVersion", "16.9"),
    dbInstanceClass: optionalString(app, "dbInstanceClass", "t4g.micro"),
    dbAllocatedStorageGb: optionalNumber(app, "dbAllocatedStorageGb", 20),
    dbBackupRetentionDays: optionalNumber(app, "dbBackupRetentionDays", 7),
    dbDeletionProtection: optionalBool(app, "dbDeletionProtection", false),

    // For learning EKS, NAT makes add-ons and image pulls much easier.
    // Set -c useNatGateway=false only if you also mirror all needed images and keep the VPC endpoints complete.
    useNatGateway: optionalBool(app, "useNatGateway", true),

    eksClusterName: optionalString(app, "eksClusterName", "orders-app-eks"),
    kubernetesVersion: "1.31",
    nodeGroupName: optionalString(app, "nodeGroupName", "orders-app-mng"),
    nodeInstanceType: optionalString(app, "nodeInstanceType", "t3.medium"),
    nodeGroupMinSize: optionalNumber(app, "nodeGroupMinSize", 2),
    nodeGroupDesiredSize: optionalNumber(app, "nodeGroupDesiredSize", 2),
    nodeGroupMaxSize: optionalNumber(app, "nodeGroupMaxSize", 4),
    nodeDiskSizeGb: optionalNumber(app, "nodeDiskSizeGb", 30),

    namespace: optionalString(app, "namespace", "orders"),
    appName: optionalString(app, "appName", "orders-app"),
    appImageTag: optionalString(app, "appImageTag", "latest"),
    adotImageTag: optionalString(app, "adotImageTag", "latest"),
    appPort: optionalNumber(app, "appPort", 8080),
    healthCheckPath: optionalString(app, "healthCheckPath", "/actuator/health/readiness"),

    podReplicas: optionalNumber(app, "podReplicas", 2),
    podMinReplicas: optionalNumber(app, "podMinReplicas", 2),
    podMaxReplicas: optionalNumber(app, "podMaxReplicas", 4),
    podCpuRequest: optionalString(app, "podCpuRequest", "500m"),
    podCpuLimit: optionalString(app, "podCpuLimit", "1000m"),
    podMemoryRequest: optionalString(app, "podMemoryRequest", "1024Mi"),
    podMemoryLimit: optionalString(app, "podMemoryLimit", "1536Mi"),
    adotCpuRequest: optionalString(app, "adotCpuRequest", "100m"),
    adotCpuLimit: optionalString(app, "adotCpuLimit", "500m"),
    adotMemoryRequest: optionalString(app, "adotMemoryRequest", "256Mi"),
    adotMemoryLimit: optionalString(app, "adotMemoryLimit", "512Mi"),
    hpaCpuTargetUtilizationPercent: optionalNumber(app, "hpaCpuTargetUtilizationPercent", 70),

    alarmEmail: nullableString(app, "alarmEmail"),
  };
}
