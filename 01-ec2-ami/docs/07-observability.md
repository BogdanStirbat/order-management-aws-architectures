# Observability

This document describes how the Orders App is observed in production, including
**logs, metrics, alarms, and dashboards**.

The goal is not to collect every possible signal, but to focus on **high-signal,
actionable telemetry** that supports day-to-day operations and incident response.

---

## Observability goals

The observability setup is designed to:

- Detect user-visible impact quickly
- Identify failing components automatically
- Provide enough context to debug issues
- Avoid excessive noise and alert fatigue

---

## Logging

### Log sources

The application produces two primary log streams:

| Log group            | Source                         | Purpose                    |
|----------------------|--------------------------------|----------------------------|
| `/orders-app/app`    | Spring Boot (systemd/journald) | Application logs           |
| `/orders-app/system` | OS / system logs               | Instance-level diagnostics |

Logs are collected using the **CloudWatch Agent**, which reads from journald and
selected log files.

### Log retention

- Log retention is intentionally limited (e.g. 7 days).
- This balances debugging needs with cost control.
- Longer retention can be enabled if required for compliance or auditing.

---

## Metrics

### Application-level metrics

Application health is primarily inferred through **load balancer metrics** rather
than custom in-process metrics.

Key signals:
- Target response time
- HTTP 5xx response count
- Request volume

This approach:
- Avoids tight coupling to application internals
- Ensures metrics remain available even when the app is unhealthy

### Infrastructure metrics

Key infrastructure metrics include:

- **ALB Target Group**
    - HealthyHostCount
    - UnhealthyHostCount
    - RequestCount
    - HTTPCode_Target_5XX_Count
    - TargetResponseTime (p95)

- **EC2**
    - CPU utilization
    - Memory and disk usage (via CloudWatch Agent)

- **RDS**
    - CPU utilization
    - Free storage space

---

## Alarms

The system defines a small number of **high-signal alarms**.

### Application availability alarms

#### Unhealthy targets

- **Metric:** ALB UnhealthyHostCount
- **Threshold:** > 0
- **Meaning:** One or more instances are not serving traffic

This alarm indicates a direct availability risk.

#### Target 5xx errors

- **Metric:** ALB Target 5xx count
- **Threshold:** ≥ 1 over multiple periods
- **Meaning:** The application is returning server errors

This is a strong indicator of user-visible failures.

### Performance alarms

#### High latency (p95)

- **Metric:** ALB TargetResponseTime (p95)
- **Threshold:** ≥ 1 second
- **Meaning:** Degraded user experience

Using p95:
- Filters out one-off outliers
- Focuses on sustained performance issues

### Data layer alarms

#### Low RDS free storage

- **Metric:** RDS FreeStorageSpace
- **Threshold:** < 5 GiB
- **Meaning:** Risk of database write failures

This is a classic failure mode for stateful services and is proactively monitored.

---

## Notifications

- All alarms publish to an **SNS topic**.
- Optional email subscriptions can be configured via CDK context.
- This decouples alerting from delivery mechanisms.

---

## Dashboards

A single **CloudWatch dashboard** provides a high-level view of system health:

### Dashboard widgets include:
- Target group healthy vs unhealthy hosts
- Request volume and 5xx errors
- p95 target response time
- RDS CPU utilization and free storage

The dashboard is intended for:
- Quick situational awareness
- Incident triage
- Capacity trend review

---

## Health checks

### Application health

- Spring Boot exposes `/actuator/health`.
- Health details are intentionally limited.
- The endpoint is used exclusively by the ALB.

### Load balancer health

- ALB health checks determine routing decisions.
- Unhealthy instances are automatically removed from service.

This layered approach ensures failures are detected even if the application
cannot emit custom metrics.

---

## Operational usage

### During an incident

Operators typically follow this sequence:

1. Alarm fires (SNS notification)
2. Check CloudWatch dashboard for correlated signals
3. Inspect application logs in `/orders-app/app`
4. Inspect system logs if necessary
5. Take corrective action (rollback, scale out, investigate DB)

### After an incident

- Review logs and metrics around the event window
- Adjust alarm thresholds if needed
- Identify missing signals or excessive noise

---

## Known limitations

This observability setup intentionally avoids:

- Distributed tracing
- Per-request correlation IDs
- Deep application metrics (e.g. per-endpoint latency)

These would be valuable in larger systems but are out of scope for this project.

---

## Future improvements

Possible enhancements include:

- Structured logging (JSON) for better querying
- Application-level metrics via Micrometer
- Tracing with AWS X-Ray or OpenTelemetry
- Log-based alarms for specific failure patterns
- SLO-driven alerting

---

## Summary

The observability approach for the Orders App emphasizes:

- A small number of reliable, high-signal alarms
- Load-balancer-centric availability metrics
- Centralized logging with controlled retention
- Clear operational workflows

This provides effective visibility while keeping operational complexity low.
