# Orders App on EKS Managed Node Groups

This is a CDK rewrite of the ECS/Fargate variant for an EKS deployment using EKS Managed Node Groups.

## Architecture

```text
Client
  -> HTTP API Gateway with Cognito/JWT authorizer
  -> VPC Link
  -> private ALB + AWS WAF
  -> ALB target group
  -> AWS Load Balancer Controller TargetGroupBinding
  -> Kubernetes Service
  -> Spring Boot pods on EKS Managed Node Group nodes
  -> RDS PostgreSQL in private DB subnets
```

## Important design choices

- The ALB is still created by CDK, not by Kubernetes.
- Kubernetes registers pods into the existing ALB target group by using `TargetGroupBinding` from AWS Load Balancer Controller.
- The worker nodes live in the application subnets.
- RDS lives in the database subnets.
- The HTTP API Gateway remains the public front door and still performs JWT validation.
- The private ALB still has AWS WAF associated with it.

## NAT vs fully private EKS

By default, this version uses `useNatGateway=true` because EKS add-ons and Helm-installed controllers often need to pull public images.

You can try a more private variant with:

```bash
cdk deploy --all -c useNatGateway=false
```

But then you must ensure all controller images and application images are available through private connectivity, usually by mirroring them into private ECR and keeping the VPC endpoints complete.

## Build and deploy

```bash
npm install
npm run build
npx cdk synth
npx cdk deploy --all
```

After the ECR repositories are created, push your Spring Boot image and ADOT image using the repository URIs from the stack outputs.

## Useful kubectl commands

```bash
aws eks update-kubeconfig --name orders-app-eks --region <region>

kubectl get nodes
kubectl get pods -n orders
kubectl get svc -n orders
kubectl get targetgroupbindings -n orders
kubectl describe targetgroupbinding orders-app-tgb -n orders
```

## Production hardening notes

This is a learning-oriented rewrite. Before using it as-is in production, consider:

- private EKS API endpoint only, with a controlled admin access path
- EKS access entries instead of broad bootstrap admin access
- Secrets Store CSI Driver or External Secrets Operator instead of writing the DB password into a Kubernetes Secret via CDK
- CloudWatch Container Insights or Fluent Bit for application log shipping
- AWS Load Balancer Controller IAM policy tightened to the exact official policy and resource constraints
- multi-AZ NAT gateways if you keep NAT for production
- HTTPS on the private ALB listener if you require TLS beyond API Gateway
- Kubernetes NetworkPolicies with a compatible CNI/network-policy implementation
