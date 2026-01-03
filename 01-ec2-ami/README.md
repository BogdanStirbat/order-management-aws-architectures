# Architecture 1: deployed on EC2 using AMI.

## Running the app locally.

There are two ways to run the app locally:

### Option 1. From the command line.

Start a PostgresSQL DB locally:
```
docker run --name postgres18 -p 5432:5432 -e POSTGRES_DB=orders_db -e POSTGRES_USER=orders_user -e POSTGRES_PASSWORD=mysecretpassword postgres:18
```

Build the app:
```
mvn clean install
```

Run the app:
```
java -jar target/ec2ami-0.0.1-SNAPSHOT.jar
```

### Option 2. From the IDE.

Locate, in the IDE, the `TestEc2amiApplication` class. Run it from the IDE.
