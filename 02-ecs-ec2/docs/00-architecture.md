# Architecture

This project is a Order Management API built with Spring Boot and deployed on AWS using Amazon ECS with the EC2 launch type.

The architecture is a realistic cloud-native backend system with:
- private networking and no public compute resources
- container orchestration using ECS
- authentication and authorization using Amazon Cognito
- API exposure through Amazon API Gateway (HTTP API)
- internal load balancing via Application Load Balancer (ALB)
- relational persistence using Amazon RDS (PostgreSQL)
- observability through logs, metrics, alarms, and distributed tracing

## High-level overview

At a high level, the system consists of:
- A containerized **Spring Boot REST API** 
- Internal Application Load Balancer (ALB + WAF)
- A container orchestration engine: ECS Service (EC2 Launch Type)
- API Gateway (HTTP API + JWT Authorizer)
- Amazon RDS PostgreSQL for persistence

## Request flow

### Authentication Flow
1. The client authenticates with Amazon Cognito.
2. Cognito returns a JWT access token.
3. The client includes the token in requests:

   `Authorization: Bearer <JWT>`

### API Request Flow
1. The client sends a request to API Gateway.
2. API Gateway validates the JWT using Cognito.
3. The request is forwarded via VPC Link to the internal ALB.
4. The ALB routes the request to a healthy ECS task.
5. The Spring Boot application processes the request.
6. The application interacts with the RDS PostgreSQL database.
7. The response flows back through ALB → API Gateway → client.

### Observability Flow
- Application logs → CloudWatch Logs
- Infrastructure metrics → CloudWatch
- Traces → ADOT Collector → AWS X-Ray
- ALB access logs → S3

## Runtime architecture diagram
TODO: add architecture diagram here.

## AWS Components
### Amazon VPC
- Private subnets for ECS and RDS
- No public subnets for compute resources 
- No NAT Gateway (cost optimization) 
- Interface VPC Endpoints used for:
  - ECR
  - ECS
  - CloudWatch
  - Secrets Manager 
  - Cognito
  - X-Ray 

This ensures all traffic stays within AWS private networking.

### Amazon ECR
- Stores container images:
  - Spring Boot application
  - ADOT collector
- Images are versioned using tags
- Used by ECS tasks during deployment

### Amazon ECS (EC2 Launch Type)
- ECS cluster backed by EC2 instances (Auto Scaling Group)
- Capacity Provider manages scaling and instance lifecycle
- ECS Service ensures desired number of tasks are running
- Placement strategies:
  - spread across availability zones
  - spread across instances 

Key features:
- rolling deployments
- deployment circuit breaker with automatic rollback 
- container health checks

### Application Load Balancer (ALB)
- Internal (not internet-facing)
- Routes traffic to ECS tasks (IP target mode)
- Performs health checks against `/actuator/health/readiness`
- Access logs stored in S3
- Integrated with AWS WAF for protection

### API Gateway (HTTP API)
- Public entry point for clients
- Uses JWT authorizer with Cognito
- Forwards requests via VPC Link to ALB
- Chosen over REST API for:
  - lower cost
  - lower latency
  - simpler configuration

### Amazon Cognito
- Handles user authentication
- Issues JWT tokens 
- API Gateway validates tokens
- Application also validates issuer and client ID 

### Amazon RDS (PostgreSQL)
- Managed relational database
- Credentials stored in AWS Secrets Manager
- Application connects via JDBC
- Schema managed using Flyway migrations 

### Observability (CloudWatch, ADOT, X-Ray)
- CloudWatch Logs:
  - application logs
  - ECS logs
  - ADOT logs
- CloudWatch Metrics:
  - EC2 metrics
  - ECS service scaling metrics
  - ALB metrics
- CloudWatch Alarms:
  - ALB 5xx errors
  - unhealthy targets
- AWS X-Ray:
  - distributed tracing
  - traces exported via ADOT collector

## Application Architecture

The application is a Spring Boot REST API with:
- layered architecture:
  - controllers
  - services
  - repositories
- PostgreSQL persistence via JPA/Hibernate
- Flyway for schema migrations
- OAuth2 Resource Server for JWT validation
- Actuator endpoints:
  - liveness
  - readiness 

Additional features:
- graceful shutdown enabled
- structured JSON logging
- distributed tracing via OpenTelemetry (Micrometer bridge) 

## Security Architecture

### Network Security
- RDS is isolated in private subnets
- ECS tasks run in private subnets
- ALB is internal-only
- Security groups restrict traffic flow:
  - API Gateway → ALB
  - ALB → ECS
  - ECS → RDS

### Identity and Access Management
- ECS Execution Role:
  - pulls images from ECR
  - writes logs to CloudWatch
- ECS Task Role:
  - writes traces to X-Ray

### Secrets Management
- Database password stored in AWS Secrets Manager
- Injected securely into ECS containers

### Authentication and Authorization
- Cognito handles authentication
- API Gateway validates JWT tokens
- Application enforces issuer and client ID validation 

### Web Application Firewall (WAF)
- Attached to ALB
- Protects against:
  - common web exploits (AWS Managed Rules)
  - excessive request rates (rate limiting)

## Observability
The system includes multiple observability layers:

### Logs
- Application logs → CloudWatch
- ECS and system logs → CloudWatch
- ALB access logs → S3

### Metrics
- ECS CPU and memory utilization
- EC2 instance metrics
- ALB request and error metrics

### Alarms
- ALB 5xx error threshold
- unhealthy target detection

### Tracing
- OpenTelemetry instrumentation
- ADOT Collector sidecar
- Export to AWS X-Ray

## Deployment and Availability
- Multi-AZ deployment
- ECS desired count ≥ 2
- ALB distributes traffic across tasks
- Health checks ensure only healthy tasks receive traffic
- ECS rolling deployments:
  - minHealthyPercent = 100
  - maxHealthyPercent = 200
- Deployment safety:
  - circuit breaker with rollback
  - deployment alarms
- Auto Scaling:
  - CPU-based scaling
  - memory-based scaling
- Graceful shutdown:
  - container stop timeout
  - ECS managed draining

## Design Decisions and Tradeoffs

### API Gateway HTTP API vs REST API
Chosen: HTTP API

Reasons:
- lower cost
- simpler configuration
- sufficient for use case

Tradeoff:
- fewer advanced features than REST API

### Internal ALB behind API Gateway vs ALB in Public Subnet
Chosen: Internal ALB behind API Gateway

Reason:
- private backend services
- separation of concerns
- better security boundaries 

### NAT Gateway vs VPC Endpoints
Chosen: NAT Gateway

Reason:
- cost optimization 

## Known Limitations
- Removal policies are destructive (demo-friendly, not production-safe)
- No CI/CD pipeline
- No custom domain
- Limited WAF rule set
- No external APM (e.g., Datadog/New Relic)
- Swagger endpoints exposed without additional restrictions 

## Future Improvements
- Add CI/CD pipeline (e.g., GitHub Actions)
- Introduce environment separation (dev/staging/prod)
- Add custom domain with ACM certificates
- Improve WAF rules and security hardening
- Add full APM solution
- Implement backup and restore validation
- Optimize cost and scaling policies 

