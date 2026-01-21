# Orders App - AWS CDK (v2)

This CDK app provisions:
- VPC with 2 AZs, public subnets + private app subnets + isolated DB subnets
- 2 NAT Gateways (one per AZ) for private app egress
- Internet-facing ALB (HTTP :80)
- RDS PostgreSQL Multi-AZ in isolated subnets
- AutoScalingGroup in private app subnets running a Spring Boot jar
- DB credentials stored in AWS Secrets Manager
- EC2 instances fetch DB credentials at boot and write `/etc/orders-app.env`

## Prereqs
- Node.js 18+
- AWS CDK v2 installed (`npm i -g aws-cdk`)
- AWS credentials configured

## Install
```bash
npm install
npm run build
```


## Deploy
Set the jar URL and AMI ID (Amazon Linux 2023 recommended). Example:
```
cdk deploy \
  -c appJarUrl="https://example.com/orders-app.jar" \
  -c amiId="ami-0123456789abcdef0"
```

Optional overrides:
```
cdk deploy \
  -c instanceType="t3.micro" \
  -c desiredCapacity=2 \
  -c minSize=2 \
  -c maxSize=2

```

## Outputs
- ALB DNS Name 
- RDS endpoint
```

---

### `lib/config.ts`
```ts
export type OrdersAppConfig = {
  /**
   * Public HTTPS URL to download the Spring Boot jar.
   */
  appJarUrl: string;

  /**
   * AMI ID (recommend: Amazon Linux 2023).
   */
  amiId: string;

  instanceType: string;
  desiredCapacity: number;
  minSize: number;
  maxSize: number;

  /**
   * Spring Boot port (matches your ALB target port).
   */
  appPort: number;

  /**
   * Health check path on the app.
   */
  healthCheckPath: string;

  /**
   * Database settings
   */
  dbName: string;
  dbEngineVersion: string; // e.g. "16.3"
  dbInstanceClass: string; // e.g. "t4g.micro" mapped in code
  dbAllocatedStorageGb: number;
  dbBackupRetentionDays: number;
  dbDeletionProtection: boolean;
};

export function loadConfig(): OrdersAppConfig {
  const ctx = (key: string) => process.env[key];

  // CDK context via `-c key=value` is recommended.
  // We'll read it in bin/orders-app.ts and pass it down.
  // This file just defines types and defaults if you want to centralize them.
  throw new Error("loadConfig() is not used directly; config is built in bin/orders-app.ts");
}

```

