# Deployment Guide

This document describes how to deploy the app on AWS using Docker and AWS CDK.

The deployment consists of:
- creating the AWS infrastructure required by the app
- building and pushing Docker images to Amazon ECR
- deploying the ECS service
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
- Docker 

## Deployment procedure 

### Step 0. 
- clone the repository 
- go to the cdk folder

### Step 1. Bootstrap CDK (if not already done)

`cdk bootstrap aws://<ACCOUNT_ID>/<REGION>`

### Step 2. Install dependencies 

`npm install`

### Step 3. Deploy ECR repositories 

`cdk deploy OrdersApp-EcrRepository`

After deployment, note the repository URI's:
- `<ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/orders-app-ecsec2`
- `<ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/adot`

### Step 4. Authenticate Docker to ECR

```
aws ecr get-login-password \ 
  --region <REGION> \ 
  --profile iamadmin-general \ 
| docker login \ 
  --username AWS \ 
  --password-stdin <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com
```

### Step 5. Build Docker images

#### Application Image
1. Go the `app/ecsec2` folder.
2. Run `docker build -t ecsec2:latest .`

#### ADOT collector image
1. Go to the `cdk/adot` folder.
2. Run `docker build -t adot-collector:latest .`
3. Return to the `cdk/` folder. 

### Step 6. Tag images for ECR

`docker tag ecsec2:latest <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/orders-app-ecsec2:latest`

`docker tag adot-collector:latest <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/adot:latest`

### Step 7. Push images to ECR

`docker push <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/orders-app-ecsec2:latest`

`docker push <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/adot:latest`

### Step 8. Deploy remaining stacks

```
cdk deploy OrdersApp-Network \ 
  OrdersApp-Database \ 
  OrdersApp-Alb \ 
  OrdersApp-Cognito \ 
  OrdersApp-Api \
  OrdersApp-Ecs \
  OrdersApp-Monitoring
```

After the ECS stack is deployed, the following should happen:
- ECS cluster will start EC2 instances
- ECS service will launch application tasks

### Step 9. Verify deployment

#### ECS
- Go to ECS → Cluster
- Verify:
  - Service is running
  - Desired tasks = running tasks

#### ALB
- Check target group:
  - Targets should be healthy

#### Logs
- Check CloudWatch Logs:
  - `/ecs/<stack-name>/app`
  - `/ecs/<stack-name>/adot`

### Step 10. Test the API

Go to AWS Console -> Cognito. Go to the created user pool.
Note the following:
 - `USER_POOL_ID`
 - `USER_POOL_CLIENT_ID`

Create a Cognito user.
```
aws cognito-idp admin-create-user \
  --region us-east-1 \
  --user-pool-id <USER_POOL_ID> \
  --username demo@example.com \
  --user-attributes Name=email,Value=demo@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS
```

```
aws cognito-idp admin-set-user-password \
  --region us-east-1 \
  --user-pool-id <USER_POOL_ID> \
  --username demo@example.com \
  --password 'DemoPassw0rd!' \
  --permanent
```

Obtain a JWT access token.

```
aws cognito-idp initiate-auth \
  --region us-east-1 \
  --client-id <USER_POOL_CLIENT_ID> \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=demo@example.com,PASSWORD='DemoPassw0rd!'
```

Call API Gateway 

```
curl -H "Authorization: Bearer <JWT access token>" \ https://<api-id>.execute-api.<region>.amazonaws.com/orders
```

Verify the following:
- Request is authenticated via Cognito
- Routed through API Gateway → ALB → ECS
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
- CloudWatch → ECS / EC2 / ALB metrics
#### Tracing
- X-Ray → Service map and traces 

### Step 13. Cleanup

The deployed AWS resources cost money. 

To clean all resources, run the following command:
`cdk destroy --all`

#### Notes
ECS stack deletion may take time due to:
- task draining
- EC2 instance termination

If needed, manually terminate EC2 instances to accelerate deletion

## Optional Configuration Overrides

You can override defaults using CDK context. Example:

```
cdk deploy \ 
  -c ec2InstanceType=t3.large \ 
  -c dbName=mydb \ 
  --profile iamadmin-general
```

You can find more information in the `cdk/lib/config.ts` file.

## Troubleshooting

### ECS tasks not starting
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
- scalable compute (ECS with EC2 Launch Type)
- private networking
- managed database (RDS)
- observability (CloudWatch + X-Ray)

The architecture is production-inspired while remaining suitable for demonstration and learning purposes.
