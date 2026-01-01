# Architecture 1: deployed on EC2 using AMI.

To start the DB locally:
```
docker run --name postgres18 -p 5432:5432 -e POSTGRES_DB=orders_db -e POSTGRES_USER=orders_user -e POSTGRES_PASSWORD=mysecretpassword postgres:18
```
