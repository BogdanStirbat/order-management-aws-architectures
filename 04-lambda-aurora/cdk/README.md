# Deployment procedure 

## First deployment (base infrastructure does not exists)
1. Build Lambda JAR
```
cd ../app/lambdaaurora
mvn clean install
cd -
```

2.
```
cdk deploy OrdersApp-Network
```

3. 
```
cdk deploy OrdersApp-Database
```

4. 
```
cdk deploy OrdersApp-Migration
```

5. Run the migration task

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

```
./scripts/run-migration-task.sh
```

6. 
```
cdk deploy OrdersApp-Lambda
```

7. 
```
cdk deploy OrdersApp-Cognito
```

8. 
```
cdk deploy OrdersApp-Api
```

9. 
```
cdk deploy OrdersApp-Monitoring
```

## Further deployments (base infrastructure exists)

1. Build Lambda JAR
```
cd ../app/lambdaaurora
mvn clean install
cd -
```

2. 
```
cdk deploy OrdersApp-Migration
```

3. Run the migration task
```
./scripts/run-migration-task.sh
```

4. 
```
cdk deploy OrdersApp-Lambda
```

5. 
```
cdk deploy OrdersApp-Api
```
