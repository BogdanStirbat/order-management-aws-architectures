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

## Test the app

1. Obtain the API Gateway URL

```
export API_URL=$(aws cloudformation describe-stacks \
  --stack-name OrdersApp-Api \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text)

echo $API_URL
```

2. Obtain the Cognito User Pool ID

```
export USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name OrdersApp-Cognito \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text)

echo $USER_POOL_ID
```

3. Obtain the client ID

```
export CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name OrdersApp-Cognito \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" \
  --output text)

echo $CLIENT_ID
```

4. Create a test user

```
export TEST_EMAIL="test-user@example.com"
export TEST_PASSWORD='TestPassword123!'
```

```
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$TEST_EMAIL" \
  --message-action SUPPRESS \
  --user-attributes Name=email,Value="$TEST_EMAIL" Name=email_verified,Value=true
```

```
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "$TEST_EMAIL" \
  --password "$TEST_PASSWORD" \
  --permanent
```

5. Sign in and get an ID token

```
export ID_TOKEN=$(aws cognito-idp initiate-auth \
  --client-id "$CLIENT_ID" \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$TEST_EMAIL",PASSWORD="$TEST_PASSWORD" \
  --query "AuthenticationResult.IdToken" \
  --output text)
```

6. Test an unauthorized request

```
curl -i "$API_URL/orders"
```

7. Create an order

```
curl -i -X POST "$API_URL/orders" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"totalAmount":49.99}'
```
