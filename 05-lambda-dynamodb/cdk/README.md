# Deployment procedure 

1. Build Lambda JAR
```
cd ../app/lambdadynamodb
mvn clean install
cd -
```

2. 
```
cdk deploy OrdersApp-DynamoDB
```

3. 
```
cdk deploy OrdersApp-Lambda
```

4. 
```
cdk deploy OrdersApp-Cognito
```

5. 
```
cdk deploy OrdersApp-Api
```

6. 
```
cdk deploy OrdersApp-Monitoring
```
