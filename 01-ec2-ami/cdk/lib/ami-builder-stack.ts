import * as cdk from "aws-cdk-lib";
import { Stack, StackProps, CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as imagebuilder from "aws-cdk-lib/aws-imagebuilder";

export interface AmiBuilderStackProps extends StackProps {
  vpc: ec2.IVpc;
  buildSubnet: ec2.ISubnet;   // simplest: a public subnet
  jarKey: string;             // e.g. "releases/1.0.0/app.jar"
}

function safeIdFromJarKey(jarKey: string): string {
  // keep it readable and safe for AWS “name” fields
  // releases/1.2.1/app.jar -> releases-1.2.1-app-jar
  return jarKey.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export class AmiBuilderStack extends Stack {
  public readonly bucket: s3.Bucket;
  public readonly pipelineArn: string;

  constructor(scope: Construct, id: string, props: AmiBuilderStackProps) {
    super(scope, id, props);

    const { vpc, buildSubnet, jarKey } = props;

    const jarKeyId = safeIdFromJarKey(jarKey);
    const amiParamName = `/orders-app/ami/${jarKey}`;

    // Private artifact bucket for your jar
    this.bucket = new s3.Bucket(this, "OrdersArtifacts", {
      bucketName: `${cdk.Stack.of(this).stackName.toLowerCase()}-artifacts-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      enforceSSL: true,
    });

    // Role used by the ephemeral Image Builder build instance
    const buildRole = new iam.Role(this, "ImageBuilderInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });
    buildRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );

    const paramArn = cdk.Stack.of(this).formatArn({
      service: "ssm",
      resource: "parameter",
      resourceName: amiParamName.replace(/^\//, ""),
    });

    buildRole.addToPolicy(new iam.PolicyStatement({
      actions: ["ssm:PutParameter"],
      resources: [paramArn],
    }));

    buildRole.addToPolicy(new iam.PolicyStatement({
      actions: ["ec2:DescribeImages"],
      resources: ["*"],
    }));

    // Allow the build instance to download the jar from S3
    this.bucket.grantRead(buildRole, jarKey);

    const instanceProfile = new iam.CfnInstanceProfile(this, "ImageBuilderInstanceProfile", {
      roles: [buildRole.roleName],
    });

    const buildSg = new ec2.SecurityGroup(this, "ImageBuilderBuildSg", {
      vpc,
      allowAllOutbound: true,
      description: "SG for EC2 Image Builder build instance",
    });

    // Component: install Java, create user/dirs, download jar, install systemd unit
    const componentYaml = [
      "name: OrdersAppBake",
      "description: Bake Orders Spring Boot app into AMI",
      "schemaVersion: 1.0",
      "phases:",
      "  - name: build",
      "    steps:",
      "      - name: InstallPackages",
      "        action: ExecuteBash",
      "        inputs:",
      "          commands:",
      "            - dnf -y update",
      "            - dnf -y install java-21-amazon-corretto awscli",
      "      - name: CreateUserDirs",
      "        action: ExecuteBash",
      "        inputs:",
      "          commands:",
      "            - id -u ordersapp &>/dev/null || useradd --system --create-home --shell /sbin/nologin ordersapp",
      "            - mkdir -p /opt/orders-app",
      "            - chown -R ordersapp:ordersapp /opt/orders-app",
      "      - name: DownloadJarFromS3",
      "        action: ExecuteBash",
      "        inputs:",
      "          commands:",
      `            - aws s3 cp s3://${this.bucket.bucketName}/${jarKey} /opt/orders-app/app.jar`,
      "            - chown ordersapp:ordersapp /opt/orders-app/app.jar",
      "            - chmod 0644 /opt/orders-app/app.jar",
      "      - name: InstallSystemdUnit",
      "        action: ExecuteBash",
      "        inputs:",
      "          commands:",
      "            - |",
      "              cat >/etc/systemd/system/orders-app.service <<'EOF'",
      "              [Unit]",
      "              Description=Orders App (Spring Boot)",
      "              After=network-online.target",
      "              Wants=network-online.target",
      "",
      "              [Service]",
      "              Type=simple",
      "              User=ordersapp",
      "              WorkingDirectory=/opt/orders-app",
      "              EnvironmentFile=/etc/orders-app.env",
      "              ExecStart=/usr/bin/java -jar /opt/orders-app/app.jar",
      "              Restart=always",
      "              RestartSec=5",
      "              SuccessExitStatus=143",
      "",
      "              [Install]",
      "              WantedBy=multi-user.target",
      "              EOF",
      "            - systemctl daemon-reload",
      "            - systemctl enable orders-app.service",
    ].join("\n");

    const component = new imagebuilder.CfnComponent(this, "OrdersAppComponent", {
      name: `orders-app-bake-${jarKeyId}`,
      platform: "Linux",
      version: "1.0.0",
      data: componentYaml,
    });

    // Use an always-up-to-date AL2023 AMI id via SSM dynamic reference
    // (x86_64 because your app instances are t3.micro by default)
    const parentImage = "{{resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64}}";

    const recipe = new imagebuilder.CfnImageRecipe(this, "OrdersAppRecipe", {
      name: `orders-app-recipe-${jarKeyId}`,
      version: "1.0.0",
      parentImage,
      components: [{ componentArn: component.attrArn }],
      blockDeviceMappings: [
        {
          deviceName: "/dev/xvda",
          ebs: {
            volumeSize: 16,
            volumeType: "gp3",
            encrypted: true,
            deleteOnTermination: true,
          },
        },
      ],
    });

    const infra = new imagebuilder.CfnInfrastructureConfiguration(this, "OrdersAppInfra", {
      name: `orders-app-infra-${jarKeyId}`,
      instanceProfileName: instanceProfile.ref,
      instanceTypes: ["t3.micro"],
      subnetId: buildSubnet.subnetId,
      securityGroupIds: [buildSg.securityGroupId],
      terminateInstanceOnFailure: true,
    });

    const dist = new imagebuilder.CfnDistributionConfiguration(this, "OrdersAppDist", {
      name: `orders-app-dist-${jarKeyId}`,
      distributions: [
        {
          region: cdk.Stack.of(this).region,
          amiDistributionConfiguration: {
            name: "orders-app-ami-{{ imagebuilder:buildDate }}",
            description: "Orders app baked AMI (Java + jar + systemd)",
            amiTags: {
              App: "orders-app",
              ManagedBy: "imagebuilder",
            },
          },
          ssmParameterConfigurations:[
            {
              parameterName: amiParamName,
              dataType: "aws:ec2:image",
            }
          ]
        },
      ],
    });

    const pipeline = new imagebuilder.CfnImagePipeline(this, "OrdersAppPipeline", {
      name: `orders-app-pipeline-${jarKeyId}`,
      imageRecipeArn: recipe.attrArn,
      infrastructureConfigurationArn: infra.attrArn,
      distributionConfigurationArn: dist.attrArn,
      status: "ENABLED",
    });

    this.pipelineArn = pipeline.attrArn;

    new CfnOutput(this, "ArtifactsBucketName", { value: this.bucket.bucketName });
    new CfnOutput(this, "JarKey", { value: jarKey });
    new CfnOutput(this, "AmiSsmParameterName", { value: amiParamName });
    new CfnOutput(this, "ImagePipelineArn", { value: this.pipelineArn });
  }
}
