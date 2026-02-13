# Deployment and release process

This document describes how the Orders App is **built, baked, deployed, and
rolled back**. The deployment model is based on **immutable application images**
using EC2 Image Builder and Auto Scaling.

The goal is to make releases **predictable, reversible, and low-risk**.

---

## Deployment model overview

The application is deployed as a **baked Amazon Machine Image (AMI)** that
already contains:

- Operating system (Amazon Linux 2023)
- Java runtime (Amazon Corretto 21)
- Application JAR
- systemd service definition
- CloudWatch Agent configuration

At runtime, instances only:
- Fetch configuration and secrets
- Start the application service

This minimizes boot-time logic and runtime variability.

---

## Artifact lifecycle

### Application artifact

- Each release produces a single JAR file.
- JARs are uploaded to an S3 **artifacts bucket** under an immutable key.

Example:
```
releases/1.2.3/app.jar
```

Once uploaded, artifacts are never modified.

---

## SSM parameter model

The deployment process relies on a small set of SSM parameters.

| Parameter                  | Purpose                                      |
|----------------------------|----------------------------------------------|
| `/orders-app/build/jarKey` | Points Image Builder to the next JAR to bake |
| `/orders-app/ami/latest`   | AMI ID produced by the most recent bake      |
| `/orders-app/ami/<jarKey>` | Immutable mapping of release → AMI ID        |

This separation allows:
- Safe rollbacks
- Repeatable deployments
- Clear auditability

---

## Release workflow 

This document explains how to release the service. There are 2 cases covered:
- Case 1. First release; the infrastructure is not created yet.
- Case 2. Future release; the infrastructure already exists.
- Case 3. Rollback to a previous version.

### First release

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


### Future releases

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

### Rollback to a previous version

No artifact rebuild or AMI rebake is required, since the deployment model is based on 
**immutable application images**. Thus, releases are **predictable, reversible, and low-risk**.

Step 1. Identify the jarKey corresponding to the version of the app you want to rollback to. 
For example, `release/1.1.4`.

Step 2. Deploy this app version.
```
cdk deploy OrdersApp-Compute -c jarKey=releases/1.1.4/app.jar
```

---

## Failure handling

### Image Builder failures

If the Image Builder pipeline fails:
- No AMI is produced
- No changes are deployed
- Existing instances remain unaffected 

Failures are visible via Image Builder logs and CloudWatch. 

### Deployment failures

If a deployment introduces errors:
- ALB health checks fail
- Instances are marked unhealthy
- Operators can immediately roll back

This limits blast radius and recovery time. 


## Automation opportunities

This workflow can be automated using a CI/CD pipeline that:

1. Builds and uploads the JAR
2. Updates the jarKey pointer
3. Starts Image Builder
4. Waits for completion
5. Publishes the AMI mapping
6. Deploys infrastructure

The current manual steps are intentionally explicit for learning and clarity.

---

## Summary

The Orders App deployment process:
- Uses immutable artifacts and images
- Separates build-time and run-time concerns
- Supports safe rollouts and fast rollbacks
- Avoids in-place changes on running instances

This approach favors predictability and operational safety over deployment
speed, making behavior under failure easy to reason about.