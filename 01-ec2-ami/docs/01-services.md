# Services used

This document describes the AWS services used by the Orders App, **why each
service exists**, and the **key configuration choices** made for this project.

The intent is to make the architecture understandable without reading the CDK
code.

---

## Networking and access

### Amazon VPC

**Purpose**
- Provides network isolation for all application components

**Key configuration**
- CIDR: `10.0.0.0/16`
- Spans two Availability Zones
- No NAT Gateways
- Internet Gateway attached only to public subnets

**Why**
- Enforces a private-by-default security posture
- Makes ingress and egress paths explicit

---

### Subnets

| Subnet group | Type             | Used by                                      |
|--------------|------------------|----------------------------------------------|
| `public`     | Public           | EC2 Image Builder build instances            |
| `app`        | Private isolated | Application Load Balancer, EC2 app instances |
| `db`         | Private isolated | RDS PostgreSQL                               |

**Why**
- Separates concerns between build-time, runtime, and data layers
- Limits blast radius of misconfiguration

---

### Security Groups

**Purpose**
- Act as stateful firewalls between architecture layers

**Notable rules**
- VPC Link → ALB: TCP 80
- ALB → App instances: TCP 8080
- App instances → RDS: TCP 5432
- App instances → VPC endpoints: TCP 443

**Why**
- Prevents lateral movement
- Makes allowed communication paths explicit

---

### VPC Endpoints

**Purpose**
- Enable private access to AWS services without NAT

**Configured endpoints**
- Gateway endpoint:
    - Amazon S3
- Interface endpoints:
    - AWS Systems Manager (SSM)
    - EC2 Messages / SSM Messages
    - Secrets Manager
    - CloudWatch Logs
    - CloudWatch Monitoring
    - STS
    - KMS

**Why**
- Keeps application instances fully private
- Reduces attack surface and egress cost

---

## Compute and load balancing

### Application Load Balancer (ALB)

**Purpose**
- Distributes traffic to application instances
- Performs health checks

**Key configuration**
- Internal (not internet-facing)
- Listener on port 80
- Instance-based target group
- Health check path: `/actuator/health`

**Why**
- Centralizes health-based routing
- Decouples clients from instance lifecycle

---

### EC2 Auto Scaling Group (ASG)

**Purpose**
- Runs and manages Spring Boot application instances

**Key configuration**
- Launch Template–based
- Spans private application subnets in multiple AZs
- Health checks integrated with ALB
- Rolling instance refresh enabled

**Why**
- Automatic recovery from instance failures
- Controlled, zero-downtime deployments

---

### EC2 Image Builder

**Purpose**
- Produces immutable AMIs containing the application and runtime

**What is baked into the AMI**
- Amazon Linux 2023
- Java 21 (Amazon Corretto)
- Application JAR
- systemd service definition
- CloudWatch Agent configuration

**Why**
- Predictable startup behavior
- Separation of build-time and run-time concerns
- Simplified instance boot logic

---

## Storage and configuration

### Amazon S3 (artifacts bucket)

**Purpose**
- Stores versioned application artifacts (JAR files)

**Key configuration**
- Versioned
- Encrypted
- Blocked public access

**Why**
- Enables immutable release artifacts
- Supports repeatable AMI builds

---

### AWS Systems Manager Parameter Store

**Purpose**
- Stores deployment and configuration pointers

**Key parameters**
- `/orders-app/build/jarKey`
- `/orders-app/ami/latest`
- `/orders-app/ami/<jarKey>`

**Why**
- Decouples build pipeline from runtime deployment
- Enables safe rollbacks and reproducibility

---

### AWS Secrets Manager

**Purpose**
- Stores database credentials

**Key configuration**
- Username fixed
- Password auto-generated
- Read-only access from EC2 instance role

**Why**
- Eliminates hard-coded credentials
- Supports future secret rotation

---

## Data layer

### Amazon RDS for PostgreSQL

**Purpose**
- Persistent relational database

**Key configuration**
- PostgreSQL engine
- Multi-AZ enabled
- Encrypted storage
- Automated backups
- Deletion protection configurable

**Why**
- High availability and durability
- Managed failover and backups
- Reduced operational complexity

---

## API and authentication

### Amazon API Gateway

**Purpose**
- Public entrypoint for clients

**Key configuration**
- Integrates with VPC via VPC Link
- Routes traffic to internal ALB

**Why**
- Avoids exposing ALB directly to the internet
- Centralizes public access control

---

### Amazon Cognito (User Pools)

**Purpose**
- Handles user authentication

**Key configuration**
- User Pool with email sign-in
- User Pool App Client
- JWT issuer and audience used by the application

**Why**
- Offloads authentication complexity
- Standards-based OAuth2 / JWT tokens

---

## Monitoring and operations

### Amazon CloudWatch

**Purpose**
- Centralized logging, metrics, and dashboards

**Key configuration**
- Log groups for application and system logs
- Metrics from ALB, EC2, and RDS
- Custom dashboard

**Why**
- Single pane of glass for operations
- Supports alerting and post-incident analysis

---

### Amazon SNS

**Purpose**
- Alarm notification delivery

**Key configuration**
- SNS topic for alarms
- Optional email subscriptions

**Why**
- Decouples alarms from notification endpoints
- Easy to extend (SMS, webhook, etc.)

---

## Supporting services

### AWS IAM

**Purpose**
- Identity and access control

**Key roles**
- EC2 instance role (runtime)
- Image Builder instance role (build-time)

**Why**
- Enforces least privilege
- Separates build-time and run-time permissions

---

## Summary

Each service in this architecture exists for a specific reason:

- Networking services enforce isolation
- Compute services provide resilience and scalability
- Managed services reduce operational burden
- Supporting services enable secure configuration and observability

The resulting system favors **clarity, predictability, and explicit boundaries**
over minimal service count or maximum abstraction.
