1. Build Lambda JAR
```
cd ../orders-lambda
mvn clean install
```

2. cdk deploy Network + Database
3. cdk deploy App infrastructure containing ECS migration task definition
4. Run ECS migration task
5. Deploy/update Lambda/API
6. Run smoke tests

# Deployment procedure 

## First deployment (base infrastructure does not exists)
1. Build Lambda JAR
```
cd ../orders-lambda
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
cd ../orders-lambda
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
