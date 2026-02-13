# Costs

This document describes the **cost characteristics** of the Orders App
architecture, the **primary cost drivers**, and the **levers available to control
or optimize spend**.

The goal is not to provide an exact monthly estimate, but to explain *why costs
exist* and *how they scale*.

---

## Cost model overview

The architecture follows an **always-on, steady-state cost model**:

- Core components (EC2, RDS, ALB) incur cost continuously
- Costs scale primarily with:
    - Instance sizes
    - Number of instances
    - Data storage and retention
    - Traffic volume

This differs from serverless models, where cost is driven mostly by request volume
and execution time.

---

## Primary cost drivers

### Amazon RDS (PostgreSQL)

RDS is typically the **largest single cost component**.

Cost drivers include:
- Instance class (e.g. `t3.micro`, `t4g.micro`)
- Multi-AZ deployment (approximately doubles instance cost)
- Allocated storage (GB)
- Backup retention and snapshot storage

**Why this cost is accepted:**
- Managed backups and failover
- Reduced operational burden
- Predictable performance and availability

---

### EC2 Auto Scaling Group (application instances)

Costs depend on:
- Instance type
- Number of instances (min / desired / max)
- EBS volume size

Because instances are always running:
- Costs are incurred even at low traffic levels
- Overprovisioning directly increases spend

**Mitigations:**
- Conservative instance sizing
- Keeping minimum capacity low in non-production environments

---

### Application Load Balancer (ALB)

ALB pricing includes:
- Hourly cost
- Load Balancer Capacity Units (LCUs)

LCUs scale with:
- New connections
- Active connections
- Processed bytes
- Rule evaluations

For low to moderate traffic, ALB costs are usually modest.

---

### API Gateway + VPC Link

API Gateway introduces:
- Per-request charges
- VPC Link hourly and data processing charges

This is an explicit trade-off:
- Higher cost than exposing the ALB publicly
- Improved security posture and isolation

---

### EC2 Image Builder

Image Builder costs include:
- Temporary EC2 build instances
- EBS snapshots for AMIs

These costs are:
- Infrequent (per release)
- Usually small relative to runtime infrastructure

However, unmanaged snapshot accumulation can increase storage costs over time.

---

### CloudWatch (logs, metrics, alarms)

CloudWatch costs include:
- Log ingestion
- Log storage (retention period)
- Custom metrics and alarms

Costs are kept under control by:
- Limiting log retention
- Using a small number of alarms
- Avoiding high-cardinality metrics

---

### Amazon S3 (artifacts)

Artifact storage costs are generally low:

- JAR files are small
- Bucket is versioned
- Storage grows linearly with number of releases

Old artifacts can be cleaned up if needed.

---

## Secondary cost considerations

### Data transfer

- Intra-VPC traffic is typically low-cost
- Data transfer to/from API Gateway contributes to overall spend
- Cross-AZ traffic may incur additional charges

---

## Cost optimization levers

### Instance sizing

- Right-size EC2 instances based on CPU and memory usage
- Prefer smaller instances and scale horizontally where possible

### Graviton (ARM) adoption

- Use `t4g` instances for EC2 and RDS where supported
- Lower cost per performance compared to x86

### Environment separation

- Reduce or disable Multi-AZ in non-production environments
- Lower backup retention outside production

### Log retention

- Shorten CloudWatch log retention
- Archive logs externally only if needed

### Snapshot and AMI cleanup

- Periodically delete unused AMIs and EBS snapshots
- Keep a limited number of rollback candidates

---

## Comparison with alternative architectures

### ECS on Fargate

- Lower operational overhead
- Higher per-unit compute cost
- Pay for memory/CPU even when idle

Often cheaper for:
- Bursty workloads
- Small or spiky APIs

Often more expensive for:
- Steady, always-on traffic

---

### AWS Lambda

- Pay-per-request and execution time
- Very low idle cost
- Additional costs for VPC networking and DB proxies

Often cheaper for:
- Event-driven or spiky workloads

Often more expensive or complex for:
- Long-running APIs with steady traffic
- Stateful database-backed services

---

## Cost transparency vs convenience

This architecture intentionally favors:

- Predictable monthly costs
- Clear cost attribution per component
- Explicit trade-offs over hidden abstractions

It trades some cost efficiency at low scale for:
- Operational clarity
- Learning value
- Infrastructure transparency

---

## Summary

The Orders App cost profile is driven primarily by:

- Always-on compute (EC2)
- Managed database availability (RDS Multi-AZ)
- Network entry via API Gateway + VPC Link

Costs can be tuned and reduced significantly through:
- Instance sizing
- Environment-specific configuration
- Retention and lifecycle management

Understanding these cost drivers is a core part of operating this architecture
effectively.
