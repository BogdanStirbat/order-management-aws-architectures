import * as cdk from "aws-cdk-lib";
import { Stack, StackProps, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as iam from "aws-cdk-lib/aws-iam";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { DatabaseStack } from "./database-stack";
import type { OrdersAppConfig } from "./config";

export interface ComputeStackProps extends StackProps {
  vpc: ec2.IVpc;
  appSubnets: ec2.ISubnet[];
  appSecurityGroup: ec2.ISecurityGroup;
  targetGroup: elbv2.IApplicationTargetGroup;
  database: DatabaseStack;
  config: OrdersAppConfig;
}

export class ComputeStack extends Stack {
  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { vpc, appSubnets, appSecurityGroup, targetGroup, database, config } = props;

    const role = new iam.Role(this, "OrdersAppEc2Role", {
      roleName: `orders-app-ec2-ssm-role-${this.stackName}`,
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
      ]
    });

    // Allow instances to read the DB secret
    database.secret.grantRead(role);

    // Allow describing the DB endpoint (not strictly required, but harmless)
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["rds:DescribeDBInstances"],
        resources: ["*"]
      })
    );

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "#!/bin/bash",
      "set -euo pipefail",
      "",
      "dnf -y update",
      // Java + tools for pulling secret
      "dnf -y install java-21-amazon-corretto jq awscli",
      "",
      "id -u ordersapp &>/dev/null || useradd --system --create-home --shell /sbin/nologin ordersapp",
      "mkdir -p /opt/orders-app",
      "chown -R ordersapp:ordersapp /opt/orders-app",
      "",
      `curl -fL "${config.appJarUrl}" -o /opt/orders-app/app.jar`,
      "chown ordersapp:ordersapp /opt/orders-app/app.jar",
      "chmod 0644 /opt/orders-app/app.jar",
      "",
      // Build JDBC from RDS endpoint at deploy-time
      `DB_HOST="${database.db.dbInstanceEndpointAddress}"`,
      `DB_PORT="${database.db.dbInstanceEndpointPort}"`,
      `DB_NAME="${config.dbName}"`,
      `JDBC_URL="jdbc:postgresql://${DB_HOST}:${DB_PORT}/${DB_NAME}"`,
      "",
      // Fetch username/password from Secrets Manager at boot
      `SECRET_ARN="${database.secret.secretArn}"`,
      'SECRET_JSON="$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text)"',
      'DB_USER="$(echo "$SECRET_JSON" | jq -r .username)"',
      'DB_PASS="$(echo "$SECRET_JSON" | jq -r .password)"',
      "",
      "cat >/etc/orders-app.env <<EOF",
      "SPRING_DATASOURCE_URL=${JDBC_URL}",
      "SPRING_DATASOURCE_USERNAME=${DB_USER}",
      "SPRING_DATASOURCE_PASSWORD=${DB_PASS}",
      `APP_PORT=${config.appPort}`,
      "EOF",
      "chmod 0600 /etc/orders-app.env",
      "",
      "cat >/etc/systemd/system/orders-app.service <<'EOF'",
      "[Unit]",
      "Description=Orders App (Spring Boot)",
      "After=network-online.target",
      "Wants=network-online.target",
      "",
      "[Service]",
      "Type=simple",
      "User=ordersapp",
      "WorkingDirectory=/opt/orders-app",
      "EnvironmentFile=/etc/orders-app.env",
      "ExecStart=/usr/bin/java -jar /opt/orders-app/app.jar",
      "Restart=always",
      "RestartSec=5",
      "SuccessExitStatus=143",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      "EOF",
      "",
      "systemctl daemon-reload",
      "systemctl enable --now orders-app.service"
    );

    const machineImage = ec2.MachineImage.genericLinux({
      [Stack.of(this).region]: config.amiId
    });

    const instanceType = new ec2.InstanceType(config.instanceType);

    const asg = new autoscaling.AutoScalingGroup(this, "OrdersAsg", {
      vpc,
      vpcSubnets: { subnets: appSubnets },
      minCapacity: config.minSize,
      maxCapacity: config.maxSize,
      desiredCapacity: config.desiredCapacity,
      instanceType,
      machineImage,
      securityGroup: appSecurityGroup,
      role,
      userData,
      healthCheck: autoscaling.HealthCheck.elb({
        grace: Duration.seconds(300)
      })
    });

    // Register with the ALB target group
    targetGroup.addTarget(asg);

    new cdk.CfnOutput(this, "AutoScalingGroupName", { value: asg.autoScalingGroupName });
  }
}
