# Deployment procedure 

## First deployment (base infrastructure does not exists)
1. Build Lambda JAR
```
cd ../lambdaaurora
mvn clean install
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

## Further deployments (base infrastructure exists)

1. Build Lambda JAR
```
cd ../lambdaaurora
mvn clean install
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
