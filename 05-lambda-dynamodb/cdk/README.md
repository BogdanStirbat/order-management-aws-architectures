# Deployment procedure 

1. Build Lambda JAR
```
cd ../app/lambdadynamodb
mvn clean install
cd -
```

2. Deploy the stack
```
cdk deploy --all
```
