# Architecture

This document describes the **runtime architecture** and the **deployment / release architecture** of the Orders App.
The goal is to show *how requests flow through the system*, *how the application is deployed*, and *why the main
building blocks were chosen*.

This project intentionally favors **explicit infrastructure primitives** (VPC, ALB, ASG, AMIs) over higher-level
abstractions in order to practice and document core AWS architectural patterns.

---

## High-level overview

At a high level, the system consists of:

- A **Spring Boot REST API** running on EC2 instances
- An **internal Application Load Balancer** for traffic distribution and health checks
- An **Auto Scaling Group** for capacity and resilience
- **API Gateway + VPC Link** as the public entrypoint
- **PostgreSQL on RDS (Multi-AZ)** for persistence
- A **baked AMI pipeline** using EC2 Image Builder for application delivery

The system is deployed inside a **single VPC spanning two Availability Zones**, with no NAT Gateways and no public
access to application or database instances.

---

## Runtime architecture

### Request flow

1. A client sends an HTTP request to **API Gateway**.
2. API Gateway forwards the request to a **VPC Link**, which creates elastic network interfaces (ENIs) inside the VPC.
3. The VPC Link routes traffic to an **internal Application Load Balancer (ALB)**.
4. The ALB forwards traffic to an **EC2 Auto Scaling Group** target group.
5. A Spring Boot application instance processes the request.
6. The application connects to **Amazon RDS for PostgreSQL** to read or persist data.
7. The response flows back through the same path to the client.

All application traffic remains **private inside the VPC** after entering through API Gateway.

### Runtime architecture diagram

> The editable source lives in `docs/diagrams/architecture.drawio`.

![Runtime Architecture](diagrams/architecture.png)

---

## Networking model

### VPC layout

The VPC is configured with three subnet groups across two Availability Zones:

| Subnet group | Type             | Purpose                           |
|--------------|------------------|-----------------------------------|
| `public`     | Public           | EC2 Image Builder build instances |
| `app`        | Private isolated | ALB and EC2 application instances |
| `db`         | Private isolated | RDS PostgreSQL                    |

Key characteristics:

- **No NAT Gateways**
- Application and database subnets are **not routable to the internet**
- Only the public subnet has an Internet Gateway attachment

### VPC endpoints

Because there is no NAT Gateway, application instances access AWS services through **VPC endpoints**:

- **Gateway endpoint**
    - S3 (artifact downloads during AMI build)
- **Interface endpoints**
    - SSM, EC2 Messages, SSM Messages (Session Manager)
    - Secrets Manager (database credentials)
    - CloudWatch Logs and CloudWatch Monitoring
    - STS and KMS

This allows instances to remain private while still integrating with AWS control-plane services.

---

## Load balancing and health checks

### Application Load Balancer

- The ALB is **internal** (not internet-facing).
- Listens on port **80**.
- Forwards traffic to an instance-based target group on port **8080**.

### Health checks

- The ALB health check path is `/actuator/health`.
- Spring Boot exposes a minimal health endpoint via **Spring Boot Actuator**.
- Instances are considered unhealthy if they fail health checks and are automatically replaced by the ASG.

This setup ensures that:
- Traffic is only routed to healthy instances
- Failed instances are removed and replaced automatically

---

## Data layer

### PostgreSQL on RDS

- **Amazon RDS for PostgreSQL**
- **Multi-AZ enabled**
- Storage encrypted at rest
- Automated backups enabled
- Database credentials stored in **AWS Secrets Manager**

The application retrieves database credentials at instance boot time and injects them into the runtime environment.

---

## Deployment and release architecture

### Overview

The application is deployed using **baked AMIs** rather than copying artifacts onto running instances.
Each AMI contains:

- Amazon Linux 2023
- Java 21 (Amazon Corretto)
- The application JAR
- A systemd service definition
- CloudWatch Agent configuration

### Deployment flow

1. A JAR file is built and uploaded to S3 under an immutable key  
   (e.g. `releases/1.2.3/app.jar`).
2. An SSM parameter (`/orders-app/build/jarKey`) is updated to point to that key.
3. An **EC2 Image Builder pipeline**:
    - Launches a temporary EC2 build instance
    - Installs dependencies
    - Downloads the JAR from S3
    - Bakes a new AMI
4. The pipeline writes the resulting AMI ID to:

/orders-app/ami/latest

5. A small script publishes an immutable mapping:

/orders-app/ami/<jarKey> -> ami-xxxxxxxx

6. The Auto Scaling Group’s Launch Template reads this parameter and performs a **rolling instance refresh**.


---

## Configuration flow at runtime

At instance boot time:

1. The EC2 instance assumes an IAM role.
2. The instance:
- Reads database credentials from Secrets Manager
- Reads Cognito issuer and audience values
3. Environment variables are written to `/etc/orders-app.env`.
4. The systemd service starts the Spring Boot application.

This ensures:
- No secrets are baked into the AMI
- The same AMI can be reused across environments

---

## Design principles

This architecture intentionally follows these principles:

- **Private-by-default networking**
- **Immutable application artifacts**
- **Explicit infrastructure boundaries**
- **Separation of build-time and run-time concerns**
- **Operational visibility over convenience**

It is not optimized for minimal cost or minimal YAML, but for **clarity, debuggability, and learning value**.

---
