# Deployment Guide

This document describes how to deploy the app on AWS using Docker and AWS CDK.

The deployment consists of:
- creating the AWS infrastructure required by the app
- building and pushing Docker images to Amazon ECR
- deploying the EKS service
- verifying the end-to-end flow

## Prerequisites

Before deploying, you need the following:

### AWS Setup

- An AWS account
- A configured AWS CLI profile

### Tools

- AWS CLI (configured above)
- Node.js (>= 18)
- AWS CDK (`npm install -g aws-cdk`)
- npm
- Docker
- Java 21 
- Maven 

## Deployment procedure

### Step 0.
- clone the repository
- go to the cdk folder

### Step 1. Bootstrap CDK (if not already done)

```
export AWS_REGION="<REGION>"
export AWS_ACCOUNT_ID="<ACCOUNT_ID>"

```

`cdk bootstrap "aws://${AWS_ACCOUNT_ID}/${AWS_REGION}"`

Bootstrapping is required once per account and region combination.

### Step 2. Install dependencies

`npm install`

### Step 3. Deploy ECR repositories

Execute the following commands:

`cdk deploy OrdersApp-EcrRepository`

```
export APP_ECR_URI=$(aws cloudformation describe-stacks \
  --stack-name OrdersApp-EcrRepository \
  --query "Stacks[0].Outputs[?OutputKey=='AppRepositoryUri'].OutputValue" \
  --output text)
```

```
export ADOT_ECR_URI=$(aws cloudformation describe-stacks \
  --stack-name OrdersApp-EcrRepository \
  --query "Stacks[0].Outputs[?OutputKey=='AdotRepositoryUri'].OutputValue" \
  --output text)
```

### Step 4. Authenticate Docker to ECR

```
aws ecr get-login-password \
  --region $AWS_REGION \
  --profile iamadmin-general \
| docker login \
  --username AWS \
  --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
```

### Step 5. Build Docker images

#### Application Image
1. Go the `app/eksmanagednode` folder.
2. Run `docker build -t eksmanagednode:latest .`

#### ADOT collector image
1. Go to the `cdk/adot` folder.
2. Run `docker build -t adot-collector:latest .`
3. Return to the `cdk/` folder.

### Step 6. Tag images for ECR

`docker tag eksmanagednode:latest $APP_ECR_URI:latest`

`docker tag adot-collector:latest $ADOT_ECR_URI:latest`

### Step 7. Push images to ECR

`docker push $APP_ECR_URI:latest`

`docker push $ADOT_ECR_URI:latest`

### Step 8. Deploy remaining stacks

```
cdk deploy OrdersApp-Network \ 
  OrdersApp-Database \ 
  OrdersApp-Alb \ 
  OrdersApp-Cognito \ 
  OrdersApp-Api \
  OrdersApp-Eks \
  OrdersApp-Monitoring
```

After the OrdersApp-Eks stack is deployed, the following should happen:
- EKS cluster will run pods

### Step 9. Verify deployment

#### EKS
- Go to EKS
- Verify:

#### ALB
- Check target group:
    - Targets should be healthy

#### Logs
- Check CloudWatch Logs:
    - `/eks/<stack-name>/app`
    - `/eks/<stack-name>/adot`

### Step 10. Test the API

Execute the following commands:

```
export API_URL=$(aws cloudformation describe-stacks \
  --stack-name OrdersApp-Api \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text) 
```

```
export USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name OrdersApp-Cognito \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text)
```

```
export USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name OrdersApp-Cognito \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" \
  --output text)
```


Create a Cognito user.

Set test credentials:

```
export TEST_EMAIL="test-user@example.com"
export TEST_PASSWORD='TestPassword123!'
```

```
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username "$TEST_EMAIL" \
  --user-attributes Name=email,Value="$TEST_EMAIL" Name=email_verified,Value=true \
  --message-action SUPPRESS
```

```
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username "$TEST_EMAIL" \
  --password "$TEST_PASSWORD" \
  --permanent
```

Obtain a JWT access token.

```
export ID_TOKEN=$(aws cognito-idp initiate-auth \
  --client-id "$USER_POOL_CLIENT_ID" \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$TEST_EMAIL",PASSWORD="$TEST_PASSWORD" \
  --query "AuthenticationResult.IdToken" \
  --output text)

```

Call API Gateway

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

Verify the following:
- Request is authenticated via Cognito
- Routed through API Gateway → ALB → EKS
- Application responds successfully

### Step 11. Verify database interaction
- Check application logs for:
    - successful DB connections
    - Flyway migrations
- Validate API endpoints that read/write data

### Step 12. Verify observability
#### Logs
- CloudWatch Logs should contain application output
#### Metrics
- CloudWatch → EKS / EC2 / ALB metrics
#### Tracing
- X-Ray → Service map and traces

### Step 13. Cleanup

The deployed AWS resources cost money.

To clean all resources, run the following command:
`cdk destroy --all`

## Optional Configuration Overrides

You can override defaults using CDK context. Example:

```
cdk deploy \ 
  -c useNatGateway=false \ 
  -c dbName=mydb 
```

You can find more information in the `cdk/lib/config.ts` file.

## Troubleshooting

### EKS pods not starting
- Check CloudWatch logs
- Verify image exists in ECR
- Verify IAM permissions

### ALB targets unhealthy
- Verify health check path: `/actuator/health/readiness`

### API returns 401 / 403
- Verify JWT token
- Check Cognito issuer and client ID

### X-Ray not receiving traces
- Ensure ADOT collector is running
- Verify X-Ray IAM permissions
- Verify VPC endpoint for X-Ray (if no NAT)

## Summary

This deployment creates a fully functional backend system with:
- secure authentication (Cognito)
- scalable compute (EKS with Managed Node)
- private networking
- managed database (RDS)
- observability (CloudWatch + X-Ray)

The architecture is production-inspired while remaining suitable for demonstration and learning purposes.
