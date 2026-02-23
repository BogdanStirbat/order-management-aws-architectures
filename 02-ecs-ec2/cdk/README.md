# ecsec2-cdk

CDK v2 skeleton to deploy:
- VPC (10.0.0.0/16, 2 AZs) with public + private (egress) + isolated subnets, NAT gateways
- Security Groups: ALB, ECS, DB (DB has no outbound)
- RDS PostgreSQL Multi-AZ in isolated subnets
- Secrets Manager for DB credentials (username postgres + generated password)
- ECS EC2 cluster with ASG capacity provider (t3.small, min=2 desired=2 max=2)
- Task Definition (EC2, awsvpc, logs, env vars, secrets injection)
- Internet-facing ALB + IP target group + health check path
- ECS Service (desired=2)

## Prereqs
- CDK bootstrapped in target account/region:
  cdk bootstrap --profile <profile>

## Install
npm i

## Deploy
npx cdk deploy \
  --profile <profile> \
  --parameters EcrImageUri=123456789012.dkr.ecr.us-east-1.amazonaws.com/ecsec2:latest \
  --parameters AcmCertificateArn=arn:aws:acm:us-east-1:123456789012:certificate/xxxx-xxxx-xxxx \
  --parameters DbName=appdb
