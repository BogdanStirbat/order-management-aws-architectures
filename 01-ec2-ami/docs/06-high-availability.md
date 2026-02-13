# High availability and resilience

This document describes how the Orders App achieves **high availability (HA)** and
how it behaves under different failure scenarios.

The goal of the architecture is not to eliminate all failures, but to **limit
blast radius**, **detect problems quickly**, and **recover automatically**.

---

## Availability goals

The system is designed to:

- Tolerate individual instance failures without user impact
- Continue serving traffic during the loss of a single Availability Zone
- Detect and replace unhealthy components automatically
- Fail fast and visibly when dependencies are unavailable

This project prioritizes **simplicity and predictability** over extreme
availability targets.

---

## Multi-AZ design

### VPC and subnets

- The VPC spans **two Availability Zones**.
- Each subnet group (`public`, `app`, `db`) has one subnet per AZ.
- Application instances and the database are distributed across AZs.

This ensures that no single AZ failure takes down the entire system.

---

## Application layer availability

### Auto Scaling Group (ASG)

The application runs in an **EC2 Auto Scaling Group** configured with:
- A minimum number of instances
- A desired capacity spread across AZs
- Health checks integrated with the Application Load Balancer

If an instance becomes unhealthy:
- The ALB stops routing traffic to it
- The ASG terminates and replaces the instance automatically

### Rolling deployments

Deployments use **rolling instance refresh**:

- New instances launch using the updated Launch Template
- Instances are replaced gradually
- A minimum healthy percentage is maintained throughout the rollout

This avoids full outages during deployments.

---

## Load balancer resilience

### Application Load Balancer

- The ALB is deployed across multiple AZs.
- Health checks ensure traffic is only routed to healthy targets.
- Requests are automatically load-balanced across healthy instances.

If an entire AZ becomes unavailable:
- The ALB routes traffic to instances in the remaining AZ.

---

## Database availability

### RDS PostgreSQL (Multi-AZ)

The database uses **Amazon RDS for PostgreSQL with Multi-AZ enabled**:

- A primary instance handles reads and writes.
- A synchronous standby is maintained in a different AZ.
- Failover is handled automatically by RDS.

During a database failover:
- Existing connections are dropped
- The application must reconnect

This is expected behavior and is treated as a transient failure.

---

## Failure scenarios and behavior

### Instance failure

**Scenario:** An EC2 instance crashes or becomes unhealthy.

**Behavior:**
- ALB health checks fail
- Traffic is routed away from the instance
- ASG launches a replacement instance

**User impact:** None or minimal

---

### Application process failure

**Scenario:** The Spring Boot process exits or becomes unresponsive.

**Behavior:**
- systemd restarts the service
- If failures persist, the instance is marked unhealthy
- ASG replaces the instance

**User impact:** None or minimal

---

### Availability Zone failure

**Scenario:** One AZ becomes unavailable.

**Behavior:**
- ALB routes traffic to the remaining AZ
- ASG maintains capacity using healthy subnets
- RDS fails over to the standby AZ if necessary

**User impact:** Possible brief latency spike during failover

---

### Database failover

**Scenario:** RDS primary instance fails.

**Behavior:**
- RDS promotes the standby
- DNS endpoint updates automatically
- Application reconnects on next attempt

**User impact:** Short-lived errors during failover window

---

### Dependency outage

**Scenario:** A required AWS service (e.g., Secrets Manager) is unavailable.

**Behavior:**
- New instances may fail to start
- Existing instances continue running
- Failures are surfaced via logs and alarms

**User impact:** Degraded availability if scaling or recovery is needed

---

## Health checks and detection

The system relies on multiple layers of health detection:

- **Application health endpoint** (`/actuator/health`)
- **ALB target group health checks**
- **CloudWatch alarms** on:
    - Unhealthy host count
    - Target 5xx responses
    - High response latency
    - Low database free storage

These signals allow operators to react quickly to issues.

---

## Scaling considerations

### Horizontal scaling

- Capacity is adjusted by modifying ASG desired/min/max settings.
- Scaling is currently manual or configuration-driven.

Optional improvement:
 - Add target-tracking scaling policies based on:
   - CPU utilization
   - ALB RequestCountPerTarget

### Vertical scaling

- Instance types can be changed via the Launch Template.
- RDS instance class and storage can be adjusted independently.

---

## Backup and recovery

### Database backups

- Automated RDS backups are enabled.
- Backup retention is configurable.
- Snapshots are retained independently of instance lifecycle.

### Application artifacts

- AMIs and EBS snapshots are preserved unless explicitly cleaned up.
- Previous releases remain available for rollback.

---

## Known limitations

This architecture intentionally accepts certain limitations:

- No active-active database writes across regions
- No cross-region failover
- No automated canary or blue/green deployments

These trade-offs are acceptable for the scope and goals of the project.

---

## Summary

The Orders App achieves high availability through:

- Multi-AZ infrastructure
- Load-balanced, auto-scaled application instances
- Managed database failover
- Layered health checks and monitoring

It favors **clear recovery behavior and operational simplicity** over maximum
availability guarantees, making failures predictable and recoverable.
