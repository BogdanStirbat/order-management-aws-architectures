# order-management-aws-architectures
An order management app deployed on AWS, using 4 different architectures.

# Architecture 1: deployed on EC2 using AMI.

The application runs on EC2 instances. 
The build process bakes an AMI image; EC2 instances starts from this pre-baked AMI.

Architecture diagram:

![Architecture Diagram](01-ec2-ami/docs/diagrams/architecture.png)

Project folder: [01-ec2-ami](01-ec2-ami)

---

# Architecture 2: Deployed on ECS using the EC2 launch type.

# Architecture 3: Deployed on ECS using the Fargate launch type.

# Architecture 4: Serverless architecture.
