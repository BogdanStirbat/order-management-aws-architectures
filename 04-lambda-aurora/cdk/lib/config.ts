import * as cdk from "aws-cdk-lib";

export type OrdersAppConfig = {
  auroraServerlessV2MinCapacity: number;
  auroraServerlessV2MaxCapacity: number;

  lambdaMemorySize: number;
  lambdaReservedConcurrentExecutions: number;

  alarmEmail?: string;
};

function optionalNumber(app: cdk.App, key: string, def: number): number {
  const v = app.node.tryGetContext(key);
  if (v === undefined || v === null) return def;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Context ${key} must be a number (got ${v})`);
  return n;
}

function nullableString(app: cdk.App, key: string): string | undefined {
  const v = app.node.tryGetContext(key);
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new Error(`Context ${key} must be a string`);
  return v;
}

export function loadConfig(app: cdk.App): OrdersAppConfig {

  const config: OrdersAppConfig = {
    auroraServerlessV2MinCapacity: optionalNumber(app, "auroraServerlessV2MinCapacity", 0.5),
    auroraServerlessV2MaxCapacity: optionalNumber(app, "auroraServerlessV2MaxCapacity", 2),

    lambdaMemorySize: optionalNumber(app, "lambdaMemorySize", 1024),
    lambdaReservedConcurrentExecutions: optionalNumber(app, "lambdaReservedConcurrentExecutions", 10),


    /**
     * Optional email for alarm notifications.
     * Example: cdk deploy -c alarmEmail=you@example.com
     * 
     */
    alarmEmail: nullableString(app, "alarmEmail"),
  }

  if (config.auroraServerlessV2MinCapacity <= 0) {
    throw new Error("auroraServerlessV2MinCapacity must be greater than 0");
  }

  if (config.auroraServerlessV2MaxCapacity < config.auroraServerlessV2MinCapacity) {
    throw new Error("auroraServerlessV2MaxCapacity must be greater than or equal to auroraServerlessV2MinCapacity");
  }

  if (config.lambdaMemorySize < 128) {
    throw new Error("lambdaMemorySize must be at least 128");
  }

  if (config.lambdaReservedConcurrentExecutions < 1) {
    throw new Error("lambdaReservedConcurrentExecutions must be at least 1");
  }

  return config;
}