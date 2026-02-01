import * as cdk from "aws-cdk-lib";
import { Stack, StackProps, CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as imagebuilder from "aws-cdk-lib/aws-imagebuilder";

export interface AmiBuilderStackProps extends StackProps {
  vpc: ec2.IVpc;
  buildSubnet: ec2.ISubnet; // simplest: a public subnet
}

/**
 * When you do a release, you decide a release e.g. 1.2.3 and deploy to s3
 * a jar file named "releases/x.y.z/app.jar". 
 * Next, the SSM pointer parameter name /orders-app/build/jarKey will get the value 
 * releases/x.y.z/app.jar .
 * - Image Builder component reads that parameter and downloads the jar
 * - Distribution writes resulting AMI ID to /orders-app/ami/latest
 *
 * If you want /orders-app/ami/<jarKey> for deployments/rollbacks,
 * do a small post-step (CLI/Lambda) to copy /orders-app/ami/latest into
 * /orders-app/ami/<jarKey>.
 */
export class AmiBuilderStack extends Stack {
  public readonly bucket: s3.Bucket;
  public readonly pipelineArn: string;

  // Expose these as outputs so the release scripts can use them
  public readonly jarKeyPointerParamName: string = "/orders-app/build/jarKey";
  public readonly latestAmiParamName: string = "/orders-app/ami/latest";

  constructor(scope: Construct, id: string, props: AmiBuilderStackProps) {
    super(scope, id, props);

    const { vpc, buildSubnet } = props;

    //
    // Artifacts bucket (jar lives here under an immutable key like releases/1.2.1/app.jar)
    //
    this.bucket = new s3.Bucket(this, "OrdersArtifacts", {
      bucketName: `${cdk.Stack.of(this).stackName.toLowerCase()}-artifacts-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      enforceSSL: true,
    });

    //
    // SSM parameter that points to the jarKey to bake next.
    // As part of the release process, this SSM parameter will be updated, per release, 
    // before starting the pipeline execution.
    const jarKeyPointer = new ssm.StringParameter(this, "OrdersAppBuildJarKeyPointer", {
      parameterName: this.jarKeyPointerParamName,
      stringValue: "releases/0.0.0/app.jar", // placeholder; will be updated before each pipeline execution
      description: "S3 key of the Orders app jar to bake into the next AMI (e.g., releases/1.2.1/app.jar)",
      tier: ssm.ParameterTier.STANDARD,
    });

    //
    // Role used by the ephemeral Image Builder build instance
    //
    const buildRole = new iam.Role(this, "ImageBuilderInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });
    buildRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );

    // Allow the build instance to read the jarKey pointer parameter
    jarKeyPointer.grantRead(buildRole);

    // Allow the build instance to read jars from the artifacts bucket (any key).
    this.bucket.grantRead(buildRole);

    // Allow Image Builder to write the resulting AMI ID to /orders-app/ami/latest
    const latestAmiParamArn = cdk.Stack.of(this).formatArn({
      service: "ssm",
      resource: "parameter",
      resourceName: this.latestAmiParamName.replace(/^\//, ""),
    });
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:PutParameter"],
        resources: [latestAmiParamArn],
      })
    );

    // Not strictly required, but harmless for diagnostics
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ec2:DescribeImages"],
        resources: ["*"],
      })
    );

    const instanceProfile = new iam.CfnInstanceProfile(this, "ImageBuilderInstanceProfile", {
      roles: [buildRole.roleName],
    });

    //
    // Security group for the build instance (outbound needed to reach S3/SSM via IGW/NAT)
    //
    const buildSg = new ec2.SecurityGroup(this, "ImageBuilderBuildSg", {
      vpc,
      allowAllOutbound: true,
      description: "SG for EC2 Image Builder build instance",
    });

    //
    // Component: install Java, create user/dirs, read jarKey from SSM, download jar, install systemd unit
    //
    // NOTE: Image Builder supports variable substitution from SSM Parameter Store in the form:
    //   {{ aws:ssm:/path/to/param }}
    //
    // We use that to fetch the jarKey at build time.
    //
    const componentYaml = [
      "name: OrdersAppBake",
      "description: Bake Orders Spring Boot app into AMI (jarKey from SSM pointer)",
      "schemaVersion: 1.0",
      "phases:",
      "  - name: build",
      "    steps:",
      "      - name: InstallPackages",
      "        action: ExecuteBash",
      "        inputs:",
      "          commands:",
      "            - dnf -y update",
      "            - dnf -y install java-21-amazon-corretto awscli amazon-cloudwatch-agent",
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
      "            - set -euo pipefail",
      `            - BUCKET="${this.bucket.bucketName}"`,
      `            - JAR_KEY="{{ aws:ssm:${this.jarKeyPointerParamName} }}"`,
      `            - if [ -z "$JAR_KEY" ] || [ "$JAR_KEY" = "null" ]; then echo "ERROR: jarKey pointer is empty (${this.jarKeyPointerParamName})" >&2; exit 1; fi`,
      `            - echo "Baking jar from s3://$BUCKET/$JAR_KEY"`,
      `            - aws s3 cp "s3://$BUCKET/$JAR_KEY" /opt/orders-app/app.jar`,
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
      "      - name: ConfigureCloudWatchAgent",
      "        action: ExecuteBash",
      "        inputs:",
      "          commands:",
      "            - set -euo pipefail",
      "            - mkdir -p /opt/aws/amazon-cloudwatch-agent/etc",
      "            - |",
      "              cat >/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'EOF'",
      "              {",
      "                \"agent\": {",
      "                  \"metrics_collection_interval\": 60,",
      "                  \"logfile\": \"/opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log\"",
      "                },",
      "                \"metrics\": {",
      "                  \"append_dimensions\": {",
      "                    \"AutoScalingGroupName\": \"${aws:AutoScalingGroupName}\",",
      "                    \"InstanceId\": \"${aws:InstanceId}\"",
      "                  },",
      "                  \"metrics_collected\": {",
      "                    \"mem\": {",
      "                      \"measurement\": [\"mem_used_percent\"],",
      "                      \"metrics_collection_interval\": 60",
      "                    },",
      "                    \"disk\": {",
      "                      \"measurement\": [\"used_percent\"],",
      "                      \"resources\": [\"/\"],",
      "                      \"metrics_collection_interval\": 60",
      "                    }",
      "                  }",
      "                },",
      "                \"logs\": {",
      "                  \"logs_collected\": {",
      "                    \"journald\": {",
      "                      \"collect_list\": [",
      "                        {",
      "                          \"unit\": \"orders-app.service\",",
      "                          \"log_group_name\": \"/orders-app/app\",",
      "                          \"log_stream_name\": \"{instance_id}/orders-app\"",
      "                        }",
      "                      ]",
      "                    },",
      "                    \"files\": {",
      "                      \"collect_list\": [", 
      "                        {",
      "                          \"file_path\": \"/var/log/messages\",",
      "                          \"log_group_name\": \"/orders-app/system\",",
      "                          \"log_stream_name\": \"{instance_id}/messages\"",
      "                        }",
      "                      ]",
      "                    }",
      "                  }",
      "                }",
      "              }",
      "              EOF",
      "            - chmod 0644 /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json",
      "            - systemctl enable amazon-cloudwatch-agent",
      "            - /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s",
    ].join("\n");

    const component = new imagebuilder.CfnComponent(this, "OrdersAppComponent", {
      name: `orders-app-bake-${this.stackName.toLowerCase()}`,
      platform: "Linux",
      version: "1.0.0",
      data: componentYaml,
      tags: {
        App: "orders-app",
        ManagedBy: "cdk",
      },
    });

    // Use an always-up-to-date AL2023 AMI id via SSM dynamic reference
    const parentImage =
      "{{resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64}}";

    const recipe = new imagebuilder.CfnImageRecipe(this, "OrdersAppRecipe", {
      name: `orders-app-recipe-${this.stackName.toLowerCase()}`,
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
      tags: {
        App: "orders-app",
        ManagedBy: "cdk",
      },
    });

    const infra = new imagebuilder.CfnInfrastructureConfiguration(this, "OrdersAppInfra", {
      name: `orders-app-infra-${this.stackName.toLowerCase()}`,
      instanceProfileName: instanceProfile.ref,
      instanceTypes: ["t3.micro"],
      subnetId: buildSubnet.subnetId,
      securityGroupIds: [buildSg.securityGroupId],
      terminateInstanceOnFailure: true,
      tags: {
        App: "orders-app",
        ManagedBy: "cdk",
      },
    });

    const dist = new imagebuilder.CfnDistributionConfiguration(this, "OrdersAppDist", {
      name: `orders-app-dist-${this.stackName.toLowerCase()}`,
      distributions: [
        {
          region: cdk.Stack.of(this).region,
          amiDistributionConfiguration: {
            name: "orders-app-ami-{{ imagebuilder:buildDate }}",
            description: "Orders app baked AMI (Java + jar + systemd)",
            amiTags: {
              App: "orders-app",
              ManagedBy: "imagebuilder",
              // Note: JarKey tagging is best done by your release automation
              // (e.g. tag the Image/AMI after build, or use start-execution tags)
            },
          },
          ssmParameterConfigurations: [
            {
              parameterName: this.latestAmiParamName,
              dataType: "aws:ec2:image",
            },
          ],
        },
      ],
      tags: {
        App: "orders-app",
        ManagedBy: "cdk",
      },
    });

    const pipeline = new imagebuilder.CfnImagePipeline(this, "OrdersAppPipeline", {
      name: `orders-app-pipeline-${this.stackName.toLowerCase()}`,
      imageRecipeArn: recipe.attrArn,
      infrastructureConfigurationArn: infra.attrArn,
      distributionConfigurationArn: dist.attrArn,
      status: "ENABLED",
      tags: {
        App: "orders-app",
        ManagedBy: "cdk",
      },
    });

    this.pipelineArn = pipeline.attrArn;

    new CfnOutput(this, "ArtifactsBucketName", { value: this.bucket.bucketName });
    new CfnOutput(this, "BuildJarKeyPointerParam", { value: this.jarKeyPointerParamName });
    new CfnOutput(this, "LatestAmiParamName", { value: this.latestAmiParamName });
    new CfnOutput(this, "ImagePipelineArn", { value: this.pipelineArn });
  }
}
