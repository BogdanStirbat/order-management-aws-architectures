# Architecture 1: deployed on AWS using EC2

This application is deployed on AWS using EC2, with EC2 Image Builder backed AMIs.

## The layout of this project is the following:

- app/ec2ami/ -> Spring Boot application
- cdk/ -> AWS CDK infrastructure (written in TypeScript)
- scripts/ -> Release / AMI helper scripts
- docs/ -> Architecture and design documentation

## High-level architecture

### Runtime request path 

1. Client → **API Gateway**
2. API Gateway → **VPC Link**
3. VPC Link → **internal Application Load Balancer**
4. ALB → **EC2 Auto Scaling Group** (Spring Boot app)
5. App → **RDS PostgreSQL (Multi-AZ)**

## How to deploy the service

### First deploy

Step 1. Build the jar
```
01-ec2-ami$ cd app/ec2ami/
01-ec2-ami/app/ec2ami$ mvn clean install
```

Step 2. Choose a jarKey, e.g. `jarKey=releases/1.0.0/app.jar`. This is a simple string that represents a release. 
Following instructions will assume `jarKey=releases/1.0.0/app.jar`, change accordingly if another jarKey is chosen.

Step 3. Run the first deployment of the infrastructure. This first deployment will deploy AWS infrastructure like VPC, subnets, Application Load Balancer and so on that will not change when new versions of the jar file will be deployed.
```
01-ec2-ami$ cd cdk
01-ec2-ami/cdk$ cdk deploy \ 
                   OrdersApp-Network \
                   OrdersApp-Database \
                   OrdersApp-Alb \
                   OrdersApp-AmiBuilder \
                   OrdersApp-Monitoring \
                   -c jarKey=releases/1.0.0/app.jar

```

Note. Optionally, you can add an extra `-c alarmEmail=alarms@youremail.com` parameter, to add an email address that will receive monitoring notifications.

Step 4. Upload the jar file to S3.
When the infrastructure is deployed, the `ArtifactsBucketName` will give the bucket name where app jar files will be located by the AMI Image Builder.
Upload the app jar file to the corresponding S3 bucket.
```
01-ec2-ami/cdk$ aws s3 cp ../app/ec2ami/target/*.jar s3://ordersapp-artifacts/releases/1.0.0/app.jar
```

Step 5. Update the `/orders-app/build/jarKey` SSM parameter:

```
aws ssm put-parameter \
      --name /orders-app/build/jarKey \
      --type String \
      --value "releases/1.0.0/app.jar" \
      --overwrite
```
Thus, the AMI Image Builder will know the s3 location from where to pick the jar file in order to make a new AMI.

Step 6. Trigger the Image Builder pipeline execution (console/CLI). 
Wait for the pipeline execution to complete successfully.

Step 7. Copy the latest ami to the per release ami.
```
./scripts/publish_ami_for_jarkey.sh "releases/1.0.0/app.jar"
```

This step will update the SSM parameter `/orders-app/ami/${JAR_KEY}` with the latest built AMI. 
The Compute stack will pick this AMI parameter and start new EC2 instances based on this AMI ID.


Step 8. Deploy the Compute stack. This step will actually deploy the Orders App to AWS - will start EC2 instances having the baked AMI image as starting point. 
```
01-ec2-ami/cdk$ cdk deploy OrdersApp-Compute -c jarKey=releases/1.0.0/app.jar
```


### Future deploys

Step 1. Build the jar
```
01-ec2-ami$ cd app/ec2ami/
01-ec2-ami/app/ec2ami$ mvn clean install
```

Step 2. Choose a jarKey, e.g. `jarKey=releases/1.2.1/app.jar`. This is a simple string that represents a release.
Following instructions will assume `jarKey=releases/1.2.1/app.jar`, change accordingly if another jarKey is chosen.

Step 3. Upload the jar file to S3.
```
01-ec2-ami/cdk$ aws s3 cp ../app/ec2ami/target/*.jar s3://ordersapp-artifacts/releases/1.2.1/app.jar
```
where `ordersapp-artifacts` is the s3 bucket created when the infrastructure was first deployed, 
the `ArtifactsBucketName` CloudFormation output.


Step 4. Update the `/orders-app/build/jarKey` SSM parameter:

```
aws ssm put-parameter \
  --name /orders-app/build/jarKey \
  --type String \
  --value "releases/1.2.1/app.jar" \
  --overwrite
```
Thus, the AMI Image Builder will know the s3 location from where to pick the jar file in order to make a new AMI.

Step 5. Trigger the Image Builder pipeline execution, either from the AWS console either from the CLI. 
Wait for the pipeline execution to complete successfully.

Step 6. Copy the latest ami to the per release ami.
```
./scripts/publish_ami_for_jarkey.sh "releases/1.2.1/app.jar"
```

This step will update the SSM parameter `/orders-app/ami/${JAR_KEY}` with the latest built AMI.
The Compute stack will pick this AMI parameter and start new EC2 instances based on this AMI ID.

Step 7. Run the deployment.
```
cdk deploy OrdersApp-Compute -c jarKey=releases/1.2.1/app.jar
```

If the AMI ID already exists (e.g. this deployment is actually a rollback to a previous version), 
then the steps 1-6 are not needed. Just deploy the existing AMI.


## Architecture 

![Architecture Diagram](docs/diagrams/architecture.png)

Full explanation: [docs/00-architecture.md](docs/00-architecture.md)

## Services used (summary)

- **VPC** – isolated networking, no NAT
- **VPC Endpoints** – S3, SSM, Secrets Manager, CloudWatch, STS, KMS
- **EC2 Image Builder** – bake Java + app + systemd into AMI
- **S3** – versioned artifact storage
- **SSM Parameter Store** – release pointers and AMI IDs
- **EC2 Auto Scaling Group** – run application instances
- **Application Load Balancer (internal)** – health checks and routing
- **API Gateway + VPC Link** – public entrypoint without exposing ALB
- **Cognito User Pool** – JWT authentication
- **RDS PostgreSQL (Multi-AZ)** – persistent data store
- **CloudWatch + SNS** – logs, metrics, alarms, notifications

Details: [docs/01-services.md](docs/01-services.md)

## OpenAPI / Swagger paths 

- Swagger UI: /swagger-ui.html 
- OpenAPI JSON: /v3/api-docs

## Documentation index

- [Architecture](docs/00-architecture.md)
- [Services](docs/01-services.md)
- [Request flow](docs/02-request-flow.md)
- [Deployment & Releases](docs/03-deployment-release.md)
- [Trade-offs (AMI vs ECS/Lambda)](docs/04-tradeoffs.md)
- [Security](docs/05-security.md)
- [High Availability](docs/06-high-availability.md)
- [Observability](docs/07-observability.md)
- [Costs](docs/08-costs.md)
- [Runbooks](docs/09-runbooks.md)

