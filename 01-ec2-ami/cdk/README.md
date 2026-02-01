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


## How to run the service 

### First deploy

1. Build the jar 
2. Choose a jarKey, e.g. `jarKey=releases/1.0.0/app.jar` (following instructions will asume `jarKey=releases/1.0.0/app.jar`, change accordingly if other jarKey is choosen)
3. Deploy infra: `cdk deploy OrdersApp-Network OrdersApp-Database OrdersApp-Alb OrdersApp-AmiBuilder OrdersApp-Monitoring -c jarKey=releases/1.0.0/app.jar` (optionally, you can add a parameter: -c alarmEmail=alarms@youremail.com; the alarm email will get monitoring notifications about the application)
4. Upload the jar file to the S3 bucket (created by the infra) at `releases/1.0.0/app.jar`
5. Update the `/orders-app/build/jarKey` SSM parameter:

```
aws ssm put-parameter \
  --name /orders-app/build/jarKey \
  --type String \
  --value "releases/1.0.0/app.jar" \
  --overwrite
```

6. Trigger the Image Builder pipeline execution (console/CLI). Wait for the pipeline execution to complete successfully.
7. Copy the latest ami to the per release ami: `./scripts/publish_ami_for_jarkey.sh "releases/1.0.0/app.jar"`
8. Deploy Compute: `cdk deploy OrdersApp-Compute -c jarKey=releases/1.0.0/app.jar`


### Future deploys

1. Build the jar 
2. Choose a jarKey, e.g. `jarKey=releases/1.2.1/app.jar` (following instructions will asume `jarKey=releases/1.2.1/app.jar`, change accordingly if other jarKey is choosen)
3. Upload jar to S3, at `releases/1.2.1/app.jar`
4. Update the `/orders-app/build/jarKey` SSM parameter:

```
aws ssm put-parameter \
  --name /orders-app/build/jarKey \
  --type String \
  --value "releases/1.2.1/app.jar" \
  --overwrite
```

5. Trigger the Image Builder pipeline execution (console/CLI). Wait for the pipeline execution to complete successfully.
6. Copy the latest ami to the per release ami: `./scripts/publish_ami_for_jarkey.sh "releases/1.2.1/app.jar"`
7. Run the deployment: `cdk deploy OrdersApp-Compute -c jarKey=releases/1.2.1/app.jar`

Note. If the current deployment is actually a rollback and the ami id already exists, then step 7 is enough.


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


