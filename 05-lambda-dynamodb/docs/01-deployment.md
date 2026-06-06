# Deployment Guide

This document describes how to deploy the Orders API on AWS using Maven, AWS CLI, and AWS CDK.

The deployment consists of:
- building the Java Lambda application;
- creating the AWS infrastructure required by the app;
- verifying the end-to-end flow.

The project is organized as follows:

```
project_root/
  app/
    lambdadynamodb/
  cdk/
  docs/
```

## Prerequisites

Before deploying, make sure the following requirements are available.

### AWS setup
- An AWS account.
- AWS CLI configured with credentials.
- Sufficient permissions to deploy CDK stacks and create resources such as Lambda, DynamoDB, API Gateway, Cognito, IAM, CloudWatch.
- AWS CDK bootstrapped in the target account and region.

### Local tools
- AWS CLI
- Node.js 18 or newer
- npm
- AWS CDK CLI
- Java 21
- Maven

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
cd app/lambdadynamodb
mvn clean install
cd ../..
```

This should produce the Lambda artifact at:
```
app/lambdadynamodb/target/lambdadynamodb-1.0.0.jar
```

The CDK `OrdersApp-Lambda` stack expects this file to exist.

### Step 4. Deploy the CDK stacks

```
cd cdk
cdk deploy --all
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
  "id": "4f9b6a2e-9f1e-4c9d-9a0e-3b3a7d5e1a91",
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
| `lambdaMemorySize`                   | `1024`  | Lambda memory size in MB                                  |
| `lambdaReservedConcurrentExecutions` | `10`    | Reserved Lambda concurrency                               |
| `alarmEmail`                         | none    | Optional email address for CloudWatch alarm notifications |

Example:
```
cd cdk
cdk deploy --all \
  -c lambdaMemorySize=2048 \
  -c lambdaReservedConcurrentExecutions=20   \
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


### Lambda deployment fails because the JAR is missing

The Lambda stack expects this file:
```
app/lambdadynamodb/target/lambdadynamodb-1.0.0.jar
```

Rebuild the Lambda application:
``` 
cd app/lambdadynamodb
mvn clean install
```

Then retry:

``` 
cd ../../cdk
cdk deploy OrdersApp-Lambda
```

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
- IAM permissions allow logs to be written.

## Summary

This deployment creates a serverless, DynamoDB-backed Orders API on AWS.

The deployed system includes:
- API Gateway HTTP API as the public API entry point;
- Amazon Cognito for JWT authentication;
- Java 21 AWS Lambda backend;
- DynamoDB database;
- CloudWatch logs, metrics, and alarms.
