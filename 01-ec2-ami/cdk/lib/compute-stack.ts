import * as cdk from "aws-cdk-lib";
import { Stack, StackProps, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ssm from "aws-cdk-lib/aws-ssm";
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
  jarKey: string;
  cognitoIssuerUri: string;
  cognitoAudience: string;
}

export class ComputeStack extends Stack {
  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { appSubnets, appSecurityGroup, targetGroup, database, config } = props;

    const role = new iam.Role(this, "OrdersAppEc2Role", {
      roleName: `orders-app-ec2-ssm-role-${this.stackName}`,
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy"),
      ],
    });

    // Allow instances to read the DB secret
    database.secret.grantRead(role);

    // Allow describing the DB endpoint (not strictly required, but harmless)
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["rds:DescribeDBInstances"],
        resources: ["*"],
      })
    );

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "#!/bin/bash",
      "set -euo pipefail",
      "",
      // Create service user + app dir
      "id -u ordersapp &>/dev/null || useradd --system --create-home --shell /sbin/nologin ordersapp",
      "mkdir -p /opt/orders-app",
      "chown -R ordersapp:ordersapp /opt/orders-app",
      "",
      // Build JDBC components (RDS endpoint values are resolved at deploy-time by CDK)
      `DB_HOST="${database.db.dbInstanceEndpointAddress}"`,
      `DB_PORT="${database.db.dbInstanceEndpointPort}"`,
      `DB_NAME="${config.dbName}"`,
      `COGNITO_ISSUER_URI="${props.cognitoIssuerUri}"`,
      `COGNITO_AUDIENCE="${props.cognitoAudience}"`,
      // IMPORTANT: escape $ so TypeScript doesn't try to interpolate; bash will expand at boot
      `JDBC_URL="jdbc:postgresql://\\\${DB_HOST}:\\\${DB_PORT}/\\\${DB_NAME}"`,
      "",
      // Fetch username/password from Secrets Manager at boot
      `SECRET_ARN="${database.secret.secretArn}"`,
      'SECRET_JSON="$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text)"',
      'DB_USER="$(echo "$SECRET_JSON" | jq -r .username)"',
      'DB_PASS="$(echo "$SECRET_JSON" | jq -r .password)"',
      "",
      // Fail fast if secret fields are missing (avoids confusing Spring errors)
      'if [ -z "$DB_USER" ] || [ "$DB_USER" = "null" ]; then echo "DB_USER missing in secret JSON" >&2; exit 1; fi',
      'if [ -z "$DB_PASS" ] || [ "$DB_PASS" = "null" ]; then echo "DB_PASS missing in secret JSON" >&2; exit 1; fi',
      "",
      // Write env file WITHOUT relying on heredoc expansion (robust)
      `APP_PORT="${config.appPort}"`,
      'printf "SPRING_DATASOURCE_URL=%s\\n" "$JDBC_URL" > /etc/orders-app.env',
      'printf "SPRING_DATASOURCE_USERNAME=%s\\n" "$DB_USER" >> /etc/orders-app.env',
      'printf "SPRING_DATASOURCE_PASSWORD=%s\\n" "$DB_PASS" >> /etc/orders-app.env',
      'printf "APP_PORT=%s\\n" "$APP_PORT" >> /etc/orders-app.env',
      `printf "COGNITO_ISSUER_URI=%s\\n" "$COGNITO_ISSUER_URI" >> /etc/orders-app.env`,
      `printf "COGNITO_AUDIENCE=%s\\n" "$COGNITO_AUDIENCE" >> /etc/orders-app.env`,
      "chmod 0600 /etc/orders-app.env",
      "",
      // systemd unit (quoted heredoc is correct here; we *don't* want expansion inside the unit file)
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
      "systemctl restart orders-app.service"
    );

    const amiParamName = `/orders-app/ami/${props.jarKey}`;

    const amiId = ssm.StringParameter.valueForStringParameter(this, amiParamName);

    const machineImage = ec2.MachineImage.genericLinux({
      [cdk.Stack.of(this).region]: amiId,
    });

    const instanceType = new ec2.InstanceType(config.instanceType);

    const launchTemplate = new ec2.LaunchTemplate(this, "OrdersLaunchTemplate", {
      machineImage,
      instanceType,
      securityGroup: appSecurityGroup,
      role,
      userData,
    });

    const asg = new autoscaling.CfnAutoScalingGroup(this, "OrdersAsg", {
      vpcZoneIdentifier: appSubnets.map((s) => s.subnetId),
      minSize: String(config.minSize),
      maxSize: String(config.maxSize),
      desiredCapacity: String(config.desiredCapacity),

      // Force Launch Template usage (no LaunchConfiguration will be created)
      launchTemplate: {
        launchTemplateId: launchTemplate.launchTemplateId,
        version: launchTemplate.latestVersionNumber,
      },

      // Register instances to the ALB target group
      targetGroupArns: [targetGroup.targetGroupArn],

      healthCheckType: "ELB",
      healthCheckGracePeriod: 300,
    });

    // Rolling replacement of instances whenever the Launch Template changes
    // Configure Instance Refresh (CloudFormation override)
    // NOTE: property names are CloudFormation-case sensitive
    asg.addPropertyOverride("InstanceRefresh", {
      Strategy: "Rolling",
      Triggers: ["LaunchTemplate"],
      Preferences: {
        MinHealthyPercentage: 90,
        InstanceWarmup: 300,
        SkipMatching: true,
      },
    });

    new cdk.CfnOutput(this, "AutoScalingGroupName", { value: asg.ref });
  }
}
