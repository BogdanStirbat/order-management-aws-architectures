# order-management-aws-architectures
An order management app deployed on AWS, using 4 different architectures.

# Architecture 1: deployed on EC2 using AMI.

The application runs on EC2 instances.

Architecture diagram:

![Architecture Diagram](01-ec2-ami/docs/diagrams/architecture.png)

All details can be found in the project folder: [01-ec2-ami](01-ec2-ami)

---

# Architecture 2: Deployed on ECS using the EC2 launch type.

The application runs on ECS with EC2 Launch Type.

Architecture diagram:

![Architecture Diagram](02-ecs-ec2/docs/diagrams/architecture.png)

All details can be found in the project folder: [02-ecs-ec2](02-ecs-ec2)

# Architecture 3: Deployed on ECS using the Fargate launch type.

The application runs on ECS with Fargate Launch Type.

Architecture diagram:

![Architecture Diagram](03-ecs-fargate/docs/diagrams/architecture.png)

All details can be found in the project folder: [03-ecs-fargate](03-ecs-fargate)

# Architecture 4: Deployed on Lambda with Aurora Serverless v2.

The application runs on Lambda, having Aurora Serverless v2 as database.

Architecture diagram:

![Architecture Diagram](04-lambda-aurora/docs/diagrams/architecture.png)

I intentionally excluded EKS from this comparison because Kubernetes introduces a different axis (platform complexity vs deployment model).
