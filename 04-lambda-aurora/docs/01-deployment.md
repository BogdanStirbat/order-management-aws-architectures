# Deployment Guide

This document describes how to deploy the Orders API on AWS using Maven, Docker, AWS CLI, and AWS CDK.

The deployment consists of:
- building the Java Lambda application;
- creating the AWS infrastructure required by the app;
- deploying an Aurora PostgreSQL Serverless v2 database;
- deploying an RDS Proxy in front of the database;
- deploying a Flyway migration task on ECS Fargate;
- running the database migration task;
- deploying the Java Lambda backend;
- exposing the backend through API Gateway HTTP API;
- protecting the API with Amazon Cognito;
- enabling CloudWatch logs, metrics, and alarms;
- verifying the end-to-end flow.

The project is organized as follows:

```
project_root/
  app/
    lambdaaurora/
  cdk/
  docs/
```

## Prerequisites

Before deploying, make sure the following requirements are available.

### AWS setup
- An AWS account.
- AWS CLI configured with credentials.
- Sufficient permissions to deploy CDK stacks and create resources such as VPC, Lambda, Aurora, RDS Proxy, ECS, API Gateway, Cognito, IAM, CloudWatch, and Secrets Manager.
- AWS CDK bootstrapped in the target account and region.

### Local tools
- AWS CLI
- Node.js 18 or newer
- npm
- AWS CDK CLI
- Java 21
- Maven
- Docker

Docker is required because the migration runner is packaged as a Docker image and deployed as an ECS Fargate task.

## Deployment procedure

### Step 0. Clone the repository

Clone the repository and move to the project root:
```
git clone <repository-url>
cd <repository-name>
```

The rest of this guide assumes commands are executed from the project root unless otherwise specified.

### Step 1. Bootstrap CDK

If the target AWS account and region have not been bootstrapped for CDK yet, run:

```
cd cdk
cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
cd ..
```

You only need to bootstrap once per account and region.

### Step 2. Install CDK dependencies

Install the CDK project dependencies:

```
cd cdk
npm install
cd ..
```

### Step 3. Build the Lambda JAR

The Lambda function is implemented in Java 21 and packaged as a shaded JAR.

Build it before deploying the Lambda stack:

```
cd app/lambdaaurora
mvn clean install
cd ../..
```

This should produce the Lambda artifact at:
```
app/lambdaaurora/target/lambdaaurora-1.0.0.jar
```

The CDK `OrdersApp-Lambda` stack expects this file to exist.

## First deployment

For the first deployment, deploy the stacks in dependency order.

### Step 4. Deploy the network stack

```
cd cdk
cdk deploy OrdersApp-Network
```

### Step 5. Deploy the database stack

```
cdk deploy OrdersApp-Database
```

### Step 6. Deploy the migration stack
```
cdk deploy OrdersApp-Migration
```

This creates:
- an ECS cluster for migration tasks;
- a Fargate task definition;
- a Docker image asset containing Flyway and the SQL migration files;
- a CloudWatch log group for migration logs;
- CloudFormation outputs used by the migration runner script.

The migration task is not a long-running service. It is a one-off task used to run Flyway migrations.

### Step 7. Run the database migration task

The migration task needs the ECS cluster name, task definition ARN, subnet IDs, and security group ID from the `OrdersApp-Migration` stack outputs.

Export the required values:

``` 
export CLUSTER_NAME=$(aws cloudformation describe-stacks \
  --stack-name OrdersApp-Migration \
  --query "Stacks[0].Outputs[?OutputKey=='MigrationClusterName'].OutputValue" \
  --output text)
```

```
export TASK_DEFINITION_ARN=$(aws cloudformation describe-stacks \
  --stack-name OrdersApp-Migration \
  --query "Stacks[0].Outputs[?OutputKey=='MigrationTaskDefinitionArn'].OutputValue" \
  --output text)
```

```
export SUBNET_IDS=$(aws cloudformation describe-stacks \
  --stack-name OrdersApp-Migration \
  --query "Stacks[0].Outputs[?OutputKey=='MigrationSubnetIds'].OutputValue" \
  --output text)
```

```
export SECURITY_GROUP_ID=$(aws cloudformation describe-stacks \
  --stack-name OrdersApp-Migration \
  --query "Stacks[0].Outputs[?OutputKey=='MigrationSecurityGroupId'].OutputValue" \
  --output text)
```

Run the migration task:

```
./scripts/run-migration-task.sh
```

After the task finishes, check the migration logs in CloudWatch Logs:

```
/ecs/orders-db-migration
```

The migration should create the orders table.

### Step 8. Deploy the Lambda stack

```
cdk deploy OrdersApp-Lambda
```

### Step 9. Deploy the Cognito stack

```
cdk deploy OrdersApp-Cognito
```

### Step 10. Deploy the API stack

```
cdk deploy OrdersApp-Api
```

### Step 11. Deploy the monitoring stack

```
cdk deploy OrdersApp-Monitoring
```

## Subsequent deployments

After the base infrastructure exists, the normal deployment flow is shorter.

### If only Lambda code changed

```
cd app/lambdaaurora
mvn clean install
cd ../../cdk
cdk deploy OrdersApp-Lambda
```

Depending on the API changes, you may also deploy:
```
cdk deploy OrdersApp-Api
```

If database migrations changed:

``` 
cd cdk
cdk deploy OrdersApp-Migration
```

Export variables described in Step 7, then run:
```
./scripts/run-migration-task.sh
```

If infrastructure changed, deploy the affected stack or stacks:

```
cd cdk
cdk deploy <STACK_NAME>
```

For example:

```
cdk deploy OrdersApp-Monitoring
```

## Testing the deployed API

From the `cdk/` folder:

### Step 1. Obtain the API URL

```
export API_URL=$(aws cloudformation describe-stacks \
  --stack-name OrdersApp-Api \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text)

echo $API_URL
```

### Step 2. Obtain Cognito outputs

Get the Cognito User Pool ID:
```
export USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name OrdersApp-Cognito \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text)

echo $USER_POOL_ID
```

Get the Cognito User Pool Client ID:

```
export CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name OrdersApp-Cognito \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" \
  --output text)

echo $CLIENT_ID
```

### Step 3. Create a Cognito test user

Set test credentials:

```
export TEST_EMAIL="test-user@example.com"
export TEST_PASSWORD='TestPassword123!'
```

Create the user:

```
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$TEST_EMAIL" \
  --message-action SUPPRESS \
  --user-attributes Name=email,Value="$TEST_EMAIL" Name=email_verified,Value=true
```

Set a permanent password:

```
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "$TEST_EMAIL" \
  --password "$TEST_PASSWORD" \
  --permanent
```

### Step 4. Sign in and obtain an ID token

```
export ID_TOKEN=$(aws cognito-idp initiate-auth \
  --client-id "$CLIENT_ID" \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$TEST_EMAIL",PASSWORD="$TEST_PASSWORD" \
  --query "AuthenticationResult.IdToken" \
  --output text)

echo $ID_TOKEN
```

The API Gateway Cognito authorizer expects a bearer token in the `Authorization` header.

### Step 5. Test an unauthorized request

Call the API without a token:
```
curl -i "$API_URL/orders"
```

Expected result:
```
401 Unauthorized
```

### Step 6. Create an order

```
curl -i -X POST "$API_URL/orders" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"totalAmount":49.99}'
```

Expected result:
```
201 Created
```

The response should include an order similar to:
```
{
  "id": 1,
  "version": 0,
  "status": "CREATED",
  "totalAmount": 49.99,
  "createdAt": "2026-01-01T10:00:00Z",
  "updatedAt": "2026-01-01T10:00:00Z"
}
```

## Optional configuration overrides

The CDK project supports configuration through CDK context values.

Current configuration options are defined in:

```
cdk/lib/config.ts
```

Available options include:

| Context key                          | Default | Description                                               |
|--------------------------------------|---------|-----------------------------------------------------------|
| `auroraServerlessV2MinCapacity`      | `0.5`   | Minimum Aurora Serverless v2 ACU capacity                 |
| `auroraServerlessV2MaxCapacity`      | `2`     | Maximum Aurora Serverless v2 ACU capacity                 |
| `auroraReaderCount`                  | `0`     | Number of Aurora reader instances                         |
| `lambdaMemorySize`                   | `1024`  | Lambda memory size in MB                                  |
| `lambdaReservedConcurrentExecutions` | `10`    | Reserved Lambda concurrency                               |
| `alarmEmail`                         | none    | Optional email address for CloudWatch alarm notifications |

Example:
```
cd cdk
cdk deploy OrdersApp-Database \
  -c auroraServerlessV2MinCapacity=0.5 \
  -c auroraServerlessV2MaxCapacity=4   \
  -c alarmEmail=you@example.com
```

## Cleanup

The deployed AWS resources may generate costs.

To delete all deployed stacks:

```
cd cdk
cdk destroy --all
```

## Troubleshooting
### CDK deployment fails

Check:
- AWS credentials are configured;
- the selected account and region are correct;
- CDK was bootstrapped in the target account and region;
- npm install was run in the cdk/ folder;
- the Java Lambda JAR exists before deploying OrdersApp-Lambda;
- Docker is running before deploying OrdersApp-Migration.


### Lambda deployment fails because the JAR is missing

The Lambda stack expects this file:
```
app/lambdaaurora/target/lambdaaurora-1.0.0.jar
```

Rebuild the Lambda application:
``` 
cd app/lambdaaurora
mvn clean install
```

Then retry:

``` 
cd ../../cdk
cdk deploy OrdersApp-Lambda
```

### Migration task fails

Check:
- CloudWatch logs for /ecs/orders-db-migration;
- the ECS task exit code;
- RDS Proxy status;
- Aurora cluster status;
- security group rules;
- migration task subnets;
- Secrets Manager permissions;
- Flyway migration SQL syntax.

The migration task should be able to connect to RDS Proxy on port 5432.

### API returns 401 or 403

Check:
- the Authorization header is present;
- the header has the format Bearer <ID_TOKEN>;
- the token is an ID token from the correct Cognito User Pool Client;
- the token has not expired;
- the API stack is using the expected Cognito user pool and client.

### API returns 500

Check:
- Lambda logs in CloudWatch;
- Lambda environment variables;
- Secrets Manager permissions;
- RDS Proxy availability;
- Aurora availability;
- database migration status;
- security group rules between Lambda and RDS Proxy.

### Lambda times out

Check:
- Lambda security group can reach RDS Proxy on port 5432;
- RDS Proxy security group can reach Aurora on port 5432;
- Aurora and RDS Proxy are available;
- VPC endpoints exist for Secrets Manager and CloudWatch Logs;
- Lambda timeout is sufficient;
- Aurora Serverless v2 has enough capacity.

### Cognito authentication fails

Check:
- the test user exists;
- the test user password is permanent;
- the user pool client ID is correct;
- USER_PASSWORD_AUTH is enabled on the user pool client;
- the AWS CLI command uses the correct region.

### No logs appear in CloudWatch

Check:
- the relevant log group exists;
- the Lambda function was actually invoked;
- the ECS migration task actually started;
- CloudWatch Logs VPC endpoint exists;
- IAM permissions allow logs to be written.

## Summary

This deployment creates a serverless, private, database-backed Orders API on AWS.

The deployed system includes:
- API Gateway HTTP API as the public API entry point;
- Amazon Cognito for JWT authentication;
- Java 21 AWS Lambda backend;
- Aurora PostgreSQL Serverless v2 database;
- RDS Proxy for database connection management;
- Secrets Manager for database credentials;
- ECS Fargate one-off task for Flyway migrations;
- private isolated VPC networking;
- VPC endpoints instead of a NAT Gateway;
- CloudWatch logs, metrics, and alarms.
