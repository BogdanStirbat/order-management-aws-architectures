# Security

This document describes the **security model** of the Orders App, including
network isolation, authentication, authorization, secrets handling, and
operational access.

The system follows a **defense-in-depth** approach, combining network controls,
identity-based access, and runtime isolation.

---

## Security principles

The architecture is guided by the following principles:

- **Private by default**: application and database resources are not internet-accessible
- **Least privilege**: IAM roles and security groups grant only required access
- **Separation of concerns**: authentication, networking, and secrets are handled independently
- **No static secrets in images**: sensitive values are injected at runtime

---

## Network security

### Network boundaries

- The **Application Load Balancer** is *internal* and not internet-facing.
- Application instances and the database run in **private isolated subnets**.
- There are **no NAT Gateways**.
- All ingress from the public internet terminates at **API Gateway**.

Once traffic enters the VPC via API Gateway + VPC Link, it never leaves the private
network.

### Security groups

Traffic is restricted using security groups with narrowly scoped rules:

| Source      | Destination  | Port  | Purpose                           |
|-------------|--------------|-------|-----------------------------------|
| VPC Link SG | ALB SG       | 80    | API Gateway → ALB                 |
| ALB SG      | App SG       | 8080  | Load balancer → application       |
| App SG      | DB SG        | 5432  | Application → PostgreSQL          |
| App SG      | Endpoints SG | 443   | Access AWS APIs via VPC endpoints |

No other inbound traffic is permitted.

### VPC endpoints

Because the VPC has no NAT Gateway, all AWS service access is performed through
**VPC endpoints**:

- S3 (gateway endpoint)
- Secrets Manager
- SSM / EC2 Messages / SSM Messages
- CloudWatch Logs and Monitoring
- STS
- KMS

This prevents application instances from making arbitrary outbound internet calls.

---

## Authentication and authorization

### User authentication

- User authentication is handled by **Amazon Cognito User Pools**.
- Clients authenticate with Cognito and receive **JWT access tokens**.
- Tokens include:
    - Issuer (`iss`)
    - Audience (`aud`, the User Pool App Client ID)

### API authentication

The Spring Boot application acts as an **OAuth2 Resource Server**:

- JWTs are validated using the Cognito issuer URI
- Audience validation ensures tokens are issued for the correct client

This ensures:
- Only authenticated users can access the API
- Tokens cannot be reused across unintended clients

---

## Secrets management

### Database credentials

- Database credentials are generated and stored in **AWS Secrets Manager**.
- The EC2 instance IAM role is granted **read-only access** to the secret.
- Credentials are retrieved at instance boot time.

The credentials are written to a local environment file:
```
/etc/orders-app.env
```

File permissions are restricted to prevent access by other users.

### No secrets in AMIs

The baked AMI does **not** contain:
- Database credentials
- Environment-specific configuration
- Authentication secrets

This ensures the same AMI can be reused safely across environments.

---

## Identity and access management (IAM)

### EC2 instance role

Each application instance assumes an IAM role that allows:

- Reading the database secret from Secrets Manager
- Registering with SSM Session Manager
- Publishing metrics and logs via CloudWatch Agent
- Describing RDS instances (read-only, for diagnostics)

The role does **not** allow:
- Writing secrets
- Modifying infrastructure
- Accessing unrelated AWS resources

### Image Builder role

The EC2 Image Builder pipeline uses a separate IAM role that allows:

- Reading the artifact JAR from S3
- Reading the jarKey pointer from SSM
- Writing the resulting AMI ID to SSM
- Basic EC2 image discovery for diagnostics

This separation limits the blast radius of build-time credentials.

---

## Encryption

### At rest

- **RDS storage** is encrypted
- **S3 buckets** are encrypted and block public access
- **EBS volumes** created by Image Builder are encrypted

### In transit

- API Gateway uses HTTPS for public access
- Traffic inside the VPC (API Gateway → ALB → app → DB) uses plain HTTP/TCP

This is a conscious trade-off:
- Internal traffic is isolated at the network level
- TLS termination complexity is reduced

Possible improvement:
 - Enable TLS on the ALB using ACM
 - Optionally enforce TLS between ALB and application instances

---

## Operational access

### Instance access

- Instances do not allow SSH access.
- **SSM Session Manager** is used for interactive access when required.

This provides:
- Audit logging
- IAM-based access control
- No exposed SSH ports or key management

---

## Monitoring and auditability

- Application and system logs are streamed to **CloudWatch Logs**.
- Alarms are configured for:
    - Unhealthy application instances
    - Elevated 5xx error rates
    - High response latency
    - Low RDS free storage
- Notifications are delivered via **SNS**.

These signals help detect both operational failures and potential abuse patterns.

---

## Known limitations and future improvements

This security posture is intentionally conservative but not exhaustive.

Potential improvements include:

- Enforcing JWT validation at API Gateway
- Enabling TLS for all internal service-to-service traffic
- Introducing secret rotation with application reload support
- Adding request-level rate limiting and abuse detection

---

## Summary

The Orders App security model emphasizes:

- Strong network isolation
- Explicit trust boundaries
- Runtime injection of secrets
- Auditable operational access

It balances **security, complexity, and learning value**, and documents
where further hardening would be appropriate in a production environment.
