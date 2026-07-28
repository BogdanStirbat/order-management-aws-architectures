import * as cdk from "aws-cdk-lib";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as eks from "aws-cdk-lib/aws-eks";
import * as iam from "aws-cdk-lib/aws-iam";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { KubectlV35Layer } from "@aws-cdk/lambda-layer-kubectl-v35";
import type { OrdersAppConfig } from "./config";

export interface EksStackProps extends StackProps {
  vpc: ec2.IVpc;
  appSubnets: ec2.ISubnet[];

  albSecurityGroup: ec2.ISecurityGroup;
  dbSecurityGroup: ec2.ISecurityGroup;
  endpointsSecurityGroup: ec2.ISecurityGroup;

  dbSecret: secretsmanager.ISecret;
  db: rds.DatabaseInstance;

  appRepository: ecr.Repository;
  adotRepository: ecr.Repository;

  targetGroup: elbv2.ApplicationTargetGroup;

  cognitoIssuerUri: string;
  cognitoUserPoolClientId: string;

  config: OrdersAppConfig;
}

export class EksStack extends Stack {
  public readonly cluster: eks.Cluster;
  public readonly nodeGroup: eks.Nodegroup;

  constructor(scope: Construct, id: string, props: EksStackProps) {
    super(scope, id, props);

    const { config } = props;
    const appServiceAccountName = `${config.appName}-sa`;

    this.cluster = new eks.Cluster(this, "EksCluster", {
      clusterName: config.eksClusterName,
      version: eks.KubernetesVersion.V1_35,
      vpc: props.vpc,
      vpcSubnets: [{ subnets: props.appSubnets }],
      defaultCapacity: 0,
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      kubectlLayer: new KubectlV35Layer(this, "KubectlLayer"),
      outputClusterName: true,
      outputConfigCommand: true,
    });

    this.nodeGroup = this.cluster.addNodegroupCapacity("ManagedNodeGroup", {
      nodegroupName: config.nodeGroupName,
      subnets: { subnets: props.appSubnets },
      minSize: config.nodeGroupMinSize,
      desiredSize: config.nodeGroupDesiredSize,
      maxSize: config.nodeGroupMaxSize,
      diskSize: config.nodeDiskSizeGb,
      instanceTypes: [new ec2.InstanceType(config.nodeInstanceType)],
      amiType: eks.NodegroupAmiType.AL2023_X86_64_STANDARD,
      capacityType: eks.CapacityType.ON_DEMAND,
      remoteAccess: undefined,
    });

    props.appRepository.grantPull(this.nodeGroup.role);
    props.adotRepository.grantPull(this.nodeGroup.role);

    /**
     * EKS Pod Identity Agent
     */
    const podIdentityAgent = new eks.CfnAddon(this, "EksPodIdentityAgent", {
      clusterName: this.cluster.clusterName,
      addonName: "eks-pod-identity-agent",
      resolveConflicts: "OVERWRITE",
    });

    podIdentityAgent.node.addDependency(this.cluster);

    /**
     * AWS Secrets Store CSI Driver provider
     */
    const secretsStoreProvider = new eks.CfnAddon(
      this,
      "AwsSecretsStoreCsiProvider",
      {
        clusterName: this.cluster.clusterName,
        addonName: "aws-secrets-store-csi-driver-provider",
        resolveConflicts: "OVERWRITE",
      },
    );
    secretsStoreProvider.node.addDependency(this.nodeGroup);
    secretsStoreProvider.node.addDependency(podIdentityAgent);

    /**
     * IAM role assumed through EKS Pod Identity
     */
    const appSecretsRole = new iam.Role(this, "OrdersAppSecretsRole", {
      roleName: `${config.appName}-secrets-pod-identity-role`,
      assumedBy: new iam.ServicePrincipal(
        "pods.eks.amazonaws.com").withSessionTags(),
      description:
        "Allows the Orders application pod to retrieve its RDS secret",
    });

    props.dbSecret.grantRead(appSecretsRole);

    /**
     * Associate role with orders/orders-app-sa
     */
    const podIdentityAssociation =
      new eks.CfnPodIdentityAssociation(
        this,
        "OrdersAppSecretsPodIdentityAssociation",
        {
          clusterName: this.cluster.clusterName,
          namespace: config.namespace,
          serviceAccount: appServiceAccountName,
          roleArn: appSecretsRole.roleArn,
        },
      );

    podIdentityAssociation.node.addDependency(podIdentityAgent);
    podIdentityAssociation.node.addDependency(appSecretsRole);

    /**
     * Security Groups Ingress
     */
    new ec2.CfnSecurityGroupIngress(this, "AlbToEksIngress", {
      groupId: this.cluster.clusterSecurityGroup.securityGroupId,
      sourceSecurityGroupId: props.albSecurityGroup.securityGroupId,
      ipProtocol: "tcp",
      fromPort: config.appPort,
      toPort: config.appPort,
      description: "Application traffic from ALB",
    });

    new ec2.CfnSecurityGroupIngress(this, "EksToDbIngress", {
      groupId: props.dbSecurityGroup.securityGroupId,
      sourceSecurityGroupId:
        this.cluster.clusterSecurityGroup.securityGroupId,
      ipProtocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
      description: "PostgreSQL from EKS",
    });

    new ec2.CfnSecurityGroupIngress(this, "EksToEndpointsIngress", {
      groupId: props.endpointsSecurityGroup.securityGroupId,
      sourceSecurityGroupId:
        this.cluster.clusterSecurityGroup.securityGroupId,
      ipProtocol: "tcp",
      fromPort: 443,
      toPort: 443,
      description: "HTTPS from EKS",
    });

    this.nodeGroup.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess"),
    );

    const metricsServer = this.installMetricsServer();
    const loadBalancerController = this.installAwsLoadBalancerController(props);
    const appResources = this.installApplication(props);

    appResources.node.addDependency(this.nodeGroup);
    appResources.node.addDependency(podIdentityAgent);
    appResources.node.addDependency(secretsStoreProvider);
    appResources.node.addDependency(podIdentityAssociation);
    appResources.node.addDependency(loadBalancerController);
    appResources.node.addDependency(metricsServer);

    new cdk.CfnOutput(this, "EksClusterName", { value: this.cluster.clusterName });
    new cdk.CfnOutput(this, "EksKubectlRoleArn", { value: this.cluster.kubectlRole?.roleArn ?? "" });
  }

  private installMetricsServer(): eks.HelmChart {
    return this.cluster.addHelmChart("MetricsServer", {
      namespace: "kube-system",
      repository: "https://kubernetes-sigs.github.io/metrics-server/",
      chart: "metrics-server",
      release: "metrics-server",
      values: {
        args: ["--kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname"],
      },
    });
  }

  private installAwsLoadBalancerController(props: EksStackProps): eks.HelmChart {
    const serviceAccount = this.cluster.addServiceAccount("AwsLoadBalancerControllerSa", {
      name: "aws-load-balancer-controller",
      namespace: "kube-system",
    });

    serviceAccount.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "elasticloadbalancing:DescribeLoadBalancers",
        "elasticloadbalancing:DescribeListeners",
        "elasticloadbalancing:DescribeRules",
        "elasticloadbalancing:DescribeTargetGroups",
        "elasticloadbalancing:DescribeTargetHealth",
        "elasticloadbalancing:RegisterTargets",
        "elasticloadbalancing:DeregisterTargets",
        "elasticloadbalancing:ModifyTargetGroup",
        "elasticloadbalancing:ModifyTargetGroupAttributes",
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeInstances",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DescribeAvailabilityZones",
        "ec2:DescribeTags",
        "ec2:CreateTags",
      ],
      resources: ["*"],
    }));

    const chart = this.cluster.addHelmChart("AwsLoadBalancerController", {
      namespace: "kube-system",
      repository: "https://aws.github.io/eks-charts",
      chart: "aws-load-balancer-controller",
      release: "aws-load-balancer-controller",
      values: {
        clusterName: this.cluster.clusterName,
        region: Stack.of(this).region,
        vpcId: props.vpc.vpcId,
        serviceAccount: {
          create: false,
          name: serviceAccount.serviceAccountName,
        },
      },
    });

    chart.node.addDependency(serviceAccount);
    return chart;
  }

  private installApplication(props: EksStackProps): eks.KubernetesManifest {
    const { config } = props;

    const appServiceAccountName = `${config.appName}-sa`;
    const secretProviderClassName = `${config.appName}-rds`;

    const namespace = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: config.namespace },
    };

    const serviceAccount = {
      apiVersion: "v1",
      kind: "ServiceAccount",
      metadata: {
        name: `${config.appName}-sa`,
        namespace: config.namespace,
      },
    };

    const secretProviderClass = {
      apiVersion: "secrets-store.csi.x-k8s.io/v1",
      kind: "SecretProviderClass",
      metadata: {
        name: `${config.appName}-rds`,
        namespace: config.namespace,
      },
      spec: {
        provider: "aws",
        parameters: {
          usePodIdentity: "true",
          objects: [
            {
              objectName: props.dbSecret.secretArn,
              objectType: "secretsmanager",
              jmesPath: [
                {
                  path: "password",
                  objectAlias: "spring.datasource.password",
                },
              ],
            },
          ],
        },
      },
    };

    const jdbcUrl = `jdbc:postgresql://${props.db.dbInstanceEndpointAddress}:${props.db.dbInstanceEndpointPort}/${config.dbName}`;

    const deployment = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: {
        name: config.appName,
        namespace: config.namespace,
        labels: { app: config.appName },
      },
      spec: {
        replicas: config.podReplicas,
        selector: { matchLabels: { app: config.appName } },
        strategy: {
          type: "RollingUpdate",
          rollingUpdate: { maxUnavailable: 0, maxSurge: 1 },
        },
        template: {
          metadata: { labels: { app: config.appName } },
          spec: {
            serviceAccountName: `${config.appName}-sa`,
            terminationGracePeriodSeconds: 60,
            volumes: [
              {
                name: "rds-secret",
                csi: {
                  driver: "secrets-store.csi.k8s.io",
                  readOnly: true,
                  volumeAttributes: {
                    secretProviderClass: `${config.appName}-rds`,
                  },
                },
              },
            ],
            containers: [
              {
                name: "app",
                image: props.appRepository.repositoryUriForTag(config.appImageTag),
                imagePullPolicy: "Always",
                volumeMounts: [
                  {
                    name: "rds-secret",
                    mountPath: "/mnt/secrets-store",
                    readOnly: true,
                  },
                ],
                ports: [{ containerPort: config.appPort }],
                env: [
                  { name: "SPRING_PROFILES_ACTIVE", value: "eks" },
                  { name: "SPRING_DATASOURCE_URL", value: jdbcUrl },
                  { name: "SPRING_DATASOURCE_USERNAME", value: "postgres" },
                  { name: "COGNITO_ISSUER_URI", value: props.cognitoIssuerUri },
                  { name: "COGNITO_USER_POOL_CLIENT_ID", value: props.cognitoUserPoolClientId },
                  { name: "OTEL_EXPORTER_OTLP_ENDPOINT", value: "http://localhost:4318/v1/traces" },
                ],
                resources: {
                  requests: { cpu: config.podCpuRequest, memory: config.podMemoryRequest },
                  limits: { cpu: config.podCpuLimit, memory: config.podMemoryLimit },
                },
                readinessProbe: {
                  httpGet: { path: config.healthCheckPath, port: config.appPort },
                  initialDelaySeconds: 30,
                  periodSeconds: 10,
                  timeoutSeconds: 5,
                  failureThreshold: 6,
                },
                livenessProbe: {
                  httpGet: { path: "/actuator/health/liveness", port: config.appPort },
                  initialDelaySeconds: 60,
                  periodSeconds: 30,
                  timeoutSeconds: 5,
                  failureThreshold: 3,
                },
              },
              {
                name: "adot-collector",
                image: props.adotRepository.repositoryUriForTag(config.adotImageTag),
                imagePullPolicy: "Always",
                args: ["--config=/etc/otel-config.yaml"],
                ports: [
                  { containerPort: 4318 },
                  { containerPort: 13133 },
                ],
                resources: {
                  requests: { cpu: config.adotCpuRequest, memory: config.adotMemoryRequest },
                  limits: { cpu: config.adotCpuLimit, memory: config.adotMemoryLimit },
                },
              },
            ],
          },
        },
      },
    };

    const service = {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name: config.appName,
        namespace: config.namespace,
      },
      spec: {
        type: "ClusterIP",
        selector: { app: config.appName },
        ports: [
          {
            name: "http",
            port: 80,
            targetPort: config.appPort,
            protocol: "TCP",
          },
        ],
      },
    };

    const hpa = {
      apiVersion: "autoscaling/v2",
      kind: "HorizontalPodAutoscaler",
      metadata: {
        name: config.appName,
        namespace: config.namespace,
      },
      spec: {
        scaleTargetRef: {
          apiVersion: "apps/v1",
          kind: "Deployment",
          name: config.appName,
        },
        minReplicas: config.podMinReplicas,
        maxReplicas: config.podMaxReplicas,
        metrics: [
          {
            type: "Resource",
            resource: {
              name: "cpu",
              target: {
                type: "Utilization",
                averageUtilization: config.hpaCpuTargetUtilizationPercent,
              },
            },
          },
        ],
      },
    };

    const targetGroupBinding = {
      apiVersion: "elbv2.k8s.aws/v1beta1",
      kind: "TargetGroupBinding",
      metadata: {
        name: `${config.appName}-tgb`,
        namespace: config.namespace,
      },
      spec: {
        serviceRef: {
          name: config.appName,
          port: 80,
        },
        targetGroupARN: props.targetGroup.targetGroupArn,
        targetType: "ip",
      },
    };

    return this.cluster.addManifest(
      "OrdersAppKubernetesResources",
      namespace,
      serviceAccount,
      deployment,
      service,
      hpa,
      targetGroupBinding,
    );
  }
}
