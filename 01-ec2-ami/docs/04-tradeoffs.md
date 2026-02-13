# Trade-offs and architectural choices

This document explains **why this project uses baked AMIs with EC2 Auto Scaling**
instead of alternatives such as **ECS (EC2 or Fargate)** or **AWS Lambda**.

The intent is not to claim this is the “best” architecture in general, but to
document the **trade-offs**, the **operational consequences**, and the
**situations where this design makes sense**.

---

## Why use baked AMIs with EC2 Auto Scaling?

This project deploys the application as a **pre-baked Amazon Machine Image (AMI)**
that already contains:

- The operating system (Amazon Linux 2023)
- Java 21 (Amazon Corretto)
- The application JAR
- A systemd service
- CloudWatch Agent configuration

At runtime, instances only:
- Fetch secrets and configuration
- Start the systemd service

### Benefits

#### 1. Deterministic and fast startup

Because the application is already on disk:

- Instance startup time is predictable
- No runtime artifact downloads are required
- Fewer moving parts during scale-out events

This is especially valuable when:
- Scaling under load
- Recovering from instance failures
- Rolling out replacements during deployments

#### 2. Clear separation of build-time and run-time concerns

Build-time:
- Java installation
- Application packaging
- Logging and monitoring setup

Run-time:
- Configuration
- Secrets
- Environment-specific values

This separation:
- Reduces boot-time complexity
- Makes failures easier to diagnose
- Encourages immutable infrastructure practices

#### 3. Full OS-level control

Using EC2 directly allows:
- systemd service management
- Custom OS tuning
- Installation of agents (CloudWatch, debugging tools)
- Precise control over JVM flags and process lifecycle

This level of control is harder (or impossible) to achieve with fully managed
compute services.

#### 4. Explicit infrastructure primitives

This project intentionally uses:
- VPCs
- Subnets
- Security groups
- Load balancers
- Auto Scaling Groups

Rather than abstracting these away, the architecture makes these boundaries
explicit, which is valuable for:
- Learning
- Debugging
- Understanding real-world AWS systems

---

## Trade-offs and downsides of the AMI approach

### 1. Slower iteration speed

Compared to container-based deployments:

- Every application change requires a new AMI bake
- Image Builder pipelines add minutes to the feedback loop

This is acceptable for:
- Low-frequency releases
- Stable services
- Environments where predictability is more important than speed

But it is a poor fit for:
- Rapid experimentation
- High-frequency deployments

### 2. AMI lifecycle management overhead

Using AMIs introduces operational responsibilities:

- Cleaning up old AMIs and snapshots
- Patching base images regularly
- Ensuring Image Builder pipelines stay healthy

This is manageable but requires discipline and tooling.

### 3. Larger blast radius for bad images

A misconfigured AMI can:
- Affect all new instances
- Require a rollback to a previous image

Mitigations include:
- Immutable jarKey → AMI mappings
- Rolling instance refresh
- Conservative rollout settings
- Keeping known-good images available

---

## Comparison with ECS on EC2

### What ECS on EC2 would improve

- Easier rolling deployments
- Built-in service orchestration
- Better bin-packing and resource utilization
- Simpler blue/green or canary patterns

### What ECS on EC2 would add

- Another control plane to operate and debug
- Container build and registry management
- Task definition and service configuration complexity

### Why ECS on EC2 was not chosen here

This project aims to:
- Practice core EC2 and Auto Scaling mechanics
- Avoid introducing container orchestration complexity
- Keep the runtime model simple and explicit

ECS on EC2 would be a strong alternative for:
- Larger teams
- Container-native workflows
- Frequent deployments

---

## Comparison with ECS on Fargate

### What Fargate would improve

- No EC2 instance management
- Simplified scaling
- Faster application-level deployments
- Reduced operational burden

### Trade-offs of Fargate

- Higher per-unit compute cost
- Less control over the underlying OS
- More opaque runtime behavior
- Still requires containerization

### Why Fargate was not chosen here

This project intentionally values:
- OS-level visibility
- Infrastructure transparency
- Cost predictability at low scale

Fargate is often a better choice when:
- Teams want to minimize infrastructure ownership
- Workloads are bursty or highly variable
- Operational simplicity is the top priority

---

## Comparison with AWS Lambda

### Where Lambda shines

- Event-driven workloads
- Highly spiky traffic
- Minimal operational overhead
- Pay-per-use pricing

### Challenges for this workload

For a Spring Boot + relational database API, Lambda introduces:

- Cold start latency
- Database connection management complexity
- Execution time limits
- Runtime constraints

While possible, it requires:
- Connection pooling proxies
- Careful cold-start mitigation
- Architectural changes (e.g. more async patterns)

### Why Lambda was not chosen here

This application:
- Is a long-lived HTTP API
- Uses a relational database
- Benefits from warm JVMs and stable connections

Lambda would add complexity without clear benefits for this use case.

---

## When this architecture makes sense

This design is well suited for:

- Steady, predictable traffic
- Cost-sensitive environments
- Long-running JVM services
- Teams that want explicit control over infrastructure
- Systems that prioritize stability over deployment speed

---

## When this architecture does *not* make sense

It is likely a poor fit when:

- Deployment frequency is very high
- Traffic is extremely spiky
- Teams want minimal infrastructure ownership
- Containers or serverless are already standard

---

## Summary

This project chooses **AMI + Auto Scaling** not because it is the most fashionable
option, but because it:

- Provides strong isolation between build and runtime
- Offers predictable behavior under failure
- Makes infrastructure boundaries explicit
- Serves as an excellent learning and documentation vehicle

The trade-offs are real and documented, and alternative architectures would be
valid depending on the context and constraints.
