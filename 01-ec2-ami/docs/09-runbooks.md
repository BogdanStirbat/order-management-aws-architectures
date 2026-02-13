# Runbooks

This document contains **operational runbooks** for the Orders App.
Runbooks describe **what to do when something goes wrong**, using observable
signals and predictable recovery steps.

The focus is on **fast triage, safe recovery, and minimal guesswork**.

---

## General guidelines

When responding to an incident:

1. Identify **user impact** first
2. Check **alarms and dashboards**
3. Stabilize the system
4. Investigate root cause
5. Apply a long-term fix

Prefer **reversible actions** (rollback, scale out) over risky changes.

---

## Alarm-driven runbooks

### Alarm: Unhealthy application targets

**Signal**
- CloudWatch alarm: `orders-app-tg-unhealthy-hosts`

**Meaning**
- One or more EC2 instances failed ALB health checks

**Immediate actions**
1. Open the CloudWatch dashboard
2. Check:
    - Healthy vs unhealthy host count
    - Recent deployments or instance refreshes
3. Inspect application logs:
    - Log group: `/orders-app/app`

**Possible causes**
- Application startup failure
- Misconfiguration (env vars, secrets)
- Database connectivity issues

**Recovery**
- ASG will automatically replace unhealthy instances
- If failures persist:
    - Roll back to a previous AMI
    - Temporarily reduce desired capacity to stop churn

---

### Alarm: Target 5xx errors

**Signal**
- CloudWatch alarm: `orders-app-tg-5xx`

**Meaning**
- Application is returning server-side errors

**Immediate actions**
1. Check request volume vs error count
2. Inspect application logs for stack traces
3. Check database connectivity and latency

**Possible causes**
- Application bugs
- Database failover or resource exhaustion
- Invalid configuration after deployment

**Recovery**
- Roll back to last known-good AMI
- Scale out ASG if resource saturation is suspected

---

### Alarm: High p95 latency

**Signal**
- CloudWatch alarm: `orders-app-tg-latency-p95-high`

**Meaning**
- Users are experiencing slow responses

**Immediate actions**
1. Check:
    - Request count
    - Target response time
2. Inspect:
    - EC2 CPU/memory metrics
    - RDS CPU and storage metrics

**Possible causes**
- Insufficient application capacity
- Slow database queries
- Network contention

**Recovery**
- Temporarily scale out ASG
- Investigate slow queries and indexing
- Consider instance size adjustments

---

### Alarm: Low RDS free storage

**Signal**
- CloudWatch alarm: `orders-app-rds-free-storage-low`

**Meaning**
- Risk of database write failures

**Immediate actions**
1. Confirm remaining free storage
2. Check recent data growth patterns

**Recovery**
- Increase allocated storage
- Enable or adjust storage autoscaling (if desired)

**Follow-up**
- Investigate table growth and cleanup strategies

---

## Deployment-related issues

### New deployment causes failures

**Symptoms**
- Unhealthy targets shortly after deployment
- Spike in 5xx errors

**Actions**
1. Identify jarKey / AMI used by the deployment
2. Roll back to previous AMI mapping
3. Stop or slow the instance refresh if necessary

**Prevention**
- Keep at least one known-good AMI available
- Avoid large configuration changes in the same release

---

## Instance-level debugging

### Accessing an instance

- Use **SSM Session Manager**
- No SSH access is required or permitted

**Steps**
1. Open AWS Console → EC2 → Instances
2. Start Session Manager session
3. Inspect:
    - `journalctl -u orders-app`
    - `/etc/orders-app.env`
    - Application logs in CloudWatch

---

## Database incidents

### RDS failover

**Symptoms**
- Short-lived application errors
- Connection reset exceptions

**Expected behavior**
- RDS promotes standby automatically
- Application reconnects on next attempt

**Actions**
- Monitor logs for recovery
- No manual intervention required unless failures persist

---

## Configuration issues

### Secrets Manager access failure

**Symptoms**
- Instances fail during startup
- Errors fetching database credentials

**Checks**
- IAM role permissions
- Secrets Manager VPC endpoint health
- Correct secret ARN in configuration

**Recovery**
- Fix IAM or endpoint configuration
- Terminate affected instances to retry startup

---

## Scaling runbooks

### Manual scale-out

**When**
- Sustained high latency
- CPU or memory saturation

**Actions**
- Increase ASG desired capacity
- Monitor response time and error rate

### Manual scale-in

**When**
- Prolonged low traffic
- Stable metrics

**Actions**
- Reduce ASG desired capacity cautiously
- Monitor for increased latency or errors

---

## Post-incident review

After recovery:

1. Identify root cause
2. Review logs and metrics
3. Update documentation or alerts
4. Add safeguards if necessary

Even small incidents are opportunities to improve resilience.

---

## Summary

These runbooks are designed to:

- Provide clear, repeatable response steps
- Reduce decision-making under pressure
- Align operational actions with system design

They intentionally favor **stability and reversibility** over aggressive tuning.
