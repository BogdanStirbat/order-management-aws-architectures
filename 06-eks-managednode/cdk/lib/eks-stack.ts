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
import * as fs from "node:fs";
import * as path from "node:path";
import { NamespaceType } from "aws-cdk-lib/aws-servicediscovery";

function loadJsonPolicyFromProjectRoot(relativePath: string): iam.PolicyDocument {
  const absolutePath = path.resolve(process.cwd(), relativePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`IAM policy file does not exist: ${absolutePath}`);
  }

  const parsed: unknown = JSON.parse(
    fs.readFileSync(absolutePath, "utf8"),
  );

  return iam.PolicyDocument.fromJson(parsed);
}

/**
 * iam/aws-load-balancer-controller-v3.4.2-policy.json -> https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v3.4.2/docs/install/iam_policy.json
*/
const LBC_POLICY_FILES: Record<string, string> = {
  "3.4.2": "iam/aws-load-balancer-controller-v3.4.2-policy.json",
};

function loadLbcPolicy(chartVersion: string): iam.PolicyDocument {
  const policyFile = LBC_POLICY_FILES[chartVersion];

  if (!policyFile) {
    throw new Error(
      `No reviewed IAM policy is registered for AWS Load Balancer ` +
      `Controller chart ${chartVersion}`,
    );
  }

  return loadJsonPolicyFromProjectRoot(policyFile);
}

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

      tags: {
        "k8s.io/cluster-autoscaler/enabled": "true",
        [`k8s.io/cluster-autoscaler/${config.eksClusterName}`]: "owned"
      }
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
    podIdentityAgent.node.addDependency(this.nodeGroup);

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

    const metricsServer = this.installMetricsServer(props);
    const loadBalancerController = this.installAwsLoadBalancerController(props, podIdentityAgent);
    const clusterAutoscaler = this.installClusterAutoscaler(props, podIdentityAgent);
    const adotCollector = this.installAdotDaemonSet(props, podIdentityAgent);
    const appResources = this.installApplication(props);

    appResources.node.addDependency(this.nodeGroup);
    appResources.node.addDependency(podIdentityAgent);
    appResources.node.addDependency(secretsStoreProvider);
    appResources.node.addDependency(podIdentityAssociation);
    appResources.node.addDependency(loadBalancerController);
    appResources.node.addDependency(clusterAutoscaler);
    appResources.node.addDependency(adotCollector);
    appResources.node.addDependency(metricsServer);

    new cdk.CfnOutput(this, "EksClusterName", { value: this.cluster.clusterName });
    new cdk.CfnOutput(this, "EksKubectlRoleArn", { value: this.cluster.kubectlRole?.roleArn ?? "" });
  }

  private installMetricsServer(props: EksStackProps): eks.HelmChart {
    const { config } = props;

    return this.cluster.addHelmChart("MetricsServer", {
      namespace: "kube-system",
      repository: "https://kubernetes-sigs.github.io/metrics-server/",
      chart: "metrics-server",
      release: "metrics-server",

      // Chart 3.13.1 deploys Metrics Server 0.8.1.
      version: config.metricsServerChartVersion,

      values: {
        replicas: 2,
        podDisruptionBudget: {
          enabled: true,
          minAvailable: 1,
        },
        args: ["--kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname"],
      },
    });
  }

  private installAwsLoadBalancerController(
    props: EksStackProps,
    podIdentityAgent: eks.CfnAddon,
  ): eks.HelmChart {
    const { config } = props;

    const controllerServiceAccountName =
      "aws-load-balancer-controller";

    const controllerServiceAccount = this.cluster.addManifest(
      "AwsLoadBalancerControllerServiceAccount",
      {
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
          name: controllerServiceAccountName,
          namespace: "kube-system",
        },
      },
    );

    const policyDocument = loadLbcPolicy(config.awsLoadBalancerControllerChartVersion);

    const controllerPrincipal =
      new iam.ServicePrincipal("pods.eks.amazonaws.com")
        .withSessionTags()
        .withConditions({
          StringEquals: {
            "aws:RequestTag/kubernetes-namespace":
              "kube-system",
            "aws:RequestTag/kubernetes-service-account":
              controllerServiceAccountName,
          },
        });

    const controllerRole = new iam.Role(
      this,
      "AwsLoadBalancerControllerPodIdentityRole",
      {
        roleName:
          `${config.eksClusterName}-aws-lbc-v3-4-2`,
        assumedBy: controllerPrincipal,
        description:
          "Pod Identity role for AWS Load Balancer Controller v3.4.2",
      },
    );

    const controllerPolicy = new iam.ManagedPolicy(
      this,
      "AwsLoadBalancerControllerPolicyV342",
      {
        managedPolicyName:
          `${config.eksClusterName}-aws-lbc-v3-4-2-policy`,
        description:
          "Official IAM policy for AWS Load Balancer Controller v3.4.2",
        document: policyDocument,
      },
    );

    controllerRole.addManagedPolicy(controllerPolicy);

    const association = new eks.CfnPodIdentityAssociation(
      this,
      "AwsLoadBalancerControllerPodIdentityAssociation",
      {
        clusterName: this.cluster.clusterName,
        namespace: "kube-system",
        serviceAccount: controllerServiceAccountName,
        roleArn: controllerRole.roleArn,
      },
    );

    association.node.addDependency(podIdentityAgent);
    association.node.addDependency(controllerRole);
    association.node.addDependency(controllerServiceAccount);

    const chart = this.cluster.addHelmChart(
      "AwsLoadBalancerController",
      {
        namespace: "kube-system",
        repository: "https://aws.github.io/eks-charts",
        chart: "aws-load-balancer-controller",
        release: "aws-load-balancer-controller",

        // Chart 3.4.2 deploys controller v3.4.2.
        version: config.awsLoadBalancerControllerChartVersion,

        values: {
          clusterName: this.cluster.clusterName,
          region: Stack.of(this).region,
          vpcId: props.vpc.vpcId,

          replicaCount: 2,

          serviceAccount: {
            create: false,
            name: controllerServiceAccountName,
          },

          enableServiceMutatorWebhook: true,
        },
      },
    );

    chart.node.addDependency(this.nodeGroup);
    chart.node.addDependency(podIdentityAgent);
    chart.node.addDependency(controllerServiceAccount);
    chart.node.addDependency(association);
    chart.node.addDependency(controllerPolicy);

    return chart;
  }

  private installClusterAutoscaler(props: EksStackProps, podIdentityAgent: eks.CfnAddon): eks.HelmChart {
    const { config } = props;

    const serviceAccountName = "cluster-autoscaler";

    /**
     * Kubernetes Service Account
     */
    const serviceAccount = this.cluster.addManifest(
      "ClusterAutoscalerServiceAccount", 
      {
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
          name: serviceAccountName,
          namespace: "kube-system"
        }
      }
    );

    /**
     * IAM role assumed using EKS Pod Identity
     */
    const autoscalerRole = new iam.Role(
      this,
      "ClusterAutoscalerPodIdentityRole",
      {
        roleName: `${props.config.eksClusterName}-cluster-autoscaler`,
        assumedBy: new iam.ServicePrincipal("pods.eks.amazonaws.com").withSessionTags(),
        description: "Pod Identity role for Kubernetes Cluster Autoscaler"
      }
    );

    /**
     * Cluster discovery permissions
     */
    autoscalerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "autoscaling:DescribeAutoScalingGroups",
          "autoscaling:DescribeAutoScalingInstances",
          "autoscaling:DescribeLaunchConfigurations",
          "autoscaling:DescribeScalingActivities",
          "autoscaling:DescribeTags",
          "ec2:DescribeImages",
          "ec2:DescribeInstanceTypes",
          "ec2:DescribeLaunchTemplateVersions",
          "ec2:GetInstanceTypesFromInstanceRequirements",
          "eks:DescribeNodegroup"
        ],
        resources: ["*"]
      })
    );

    /**
     * Scaling permissions.
     */
    autoscalerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "autoscaling:SetDesiredCapacity",
          "autoscaling:TerminateInstanceInAutoScalingGroup",
        ],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "aws:ResourceTag/k8s.io/cluster-autoscaler/enabled": "true",
            [`aws:ResourceTag/k8s.io/cluster-autoscaler/${config.eksClusterName}`]: "owned"
          }
        }
      })
    );

    /**
     * EKS Pod Identity
     */
    const autoscalerPodIdentityAssociation = new eks.CfnPodIdentityAssociation(
      this,
      "ClusterAutoscalerPodIdentityAssociation",
      {
        clusterName: this.cluster.clusterName,
        namespace: "kube-system",
        serviceAccount: serviceAccountName,
        roleArn: autoscalerRole.roleArn
      }
    );

    autoscalerPodIdentityAssociation.node.addDependency(podIdentityAgent);
    autoscalerPodIdentityAssociation.node.addDependency(autoscalerRole);
    autoscalerPodIdentityAssociation.node.addDependency(serviceAccount);

    /**
     * Official Cluster Autoscaler Helm chart
     */
    const chart = this.cluster.addHelmChart(
      "ClusterAutoscaler",
      {
        namespace: "kube-system",
        repository: "https://kubernetes.github.io/autoscaler",
        chart: "cluster-autoscaler",
        release: "cluster-autoscaler",
        version: props.config.clusterAutoscalerChartVersion,

        values: {
          cloudProvider: "aws",
          awsRegion: Stack.of(this).region,
          autoDiscovery: {
            clusterName: this.cluster.clusterName,
          },
          image: {
            tag: props.config.clusterAutoscalerImageTag,
          },
          serviceAccount: {
            create: false,
            name: serviceAccountName,
          },
          rbac: {
            create: true,
          },
          extraArgs: {
            "balance-similar-node-groups": "true",
            "skip-nodes-with-system-pods": "false",
          },
          resources: {
            requests: {
              cpu: "100m",
              memory: "300Mi"
            },
            limits: {
              cpu: "500m",
              memory: "600Mi"
            }
          }
        }
      }
    );

    chart.node.addDependency(this.nodeGroup);
    chart.node.addDependency(podIdentityAgent);
    chart.node.addDependency(serviceAccount);
    chart.node.addDependency(autoscalerPodIdentityAssociation);

    return chart;
  }

  private installAdotDaemonSet(props: EksStackProps, podIdentityAgent: eks.CfnAddon): eks.KubernetesManifest {
    const { config } = props;

    const namespace = "kube-system";
    const serviceAccountName = "adot-collector";
    const collectorName = "adot-collector";

    /**
     * Kubernetes ServiceAccount
     */
    const serviceAccount = this.cluster.addManifest(
      "AdotCollectorServiceAccount",
      {
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
          name: serviceAccountName,
          namespace
        }
      }
    );

    /**
     * IAM role for the collector
     */
    const adotRole = new iam.Role(
      this,
      "AdotCollectorPodIdentityRole",
      {
        roleName: `${config.eksClusterName}-adot-collector`,
        assumedBy: new iam.ServicePrincipal("pods.eks.amazonaws.com").withSessionTags(),
        description: "Pod Identity role for the ADOT Collector"
      }
    );

    /**
     * Ensure that the ADOT DaemonSet has X-Ray write permissions
     */
    adotRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess")
    );

    /**
     * AdotCollector PodIdentityAssociation
     */
    const podIdentityAssociation = new eks.CfnPodIdentityAssociation(
      this,
      "AdotCollectorPodIdentityAssociation",
      {
        clusterName: this.cluster.clusterName,
        namespace,
        serviceAccount: serviceAccountName,
        roleArn: adotRole.roleArn
      }
    );

    podIdentityAgent.node.addDependency(adotRole);
    podIdentityAgent.node.addDependency(serviceAccount);

    const collectorConfig = `
extensions:
  health_check:
    endpoint: 0.0.0.0:13133
    
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

processors:
  memory_limiter:
    check_interval: 5s
    limit_mib: 256
    spike_limit_mib: 64

  batch:

exporters:
  awsxray:
    region: ${Stack.of(this).region}

service:
  extensions:
    - health_check

  pipelines:
    traces:
      receivers:
        - otlp
      processors:
        - memory_limiter
        - batch
      exporters:
        - awsxray
    `.trim();

    /**
     * ADOT Collector ConfigMap
     */
    const configMap = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: `${collectorName}-config`,
        namespace
      },
      data: {
        "otel-config.yaml": collectorConfig
      }
    };

    /**
     * ADOT Collector DaemonSet
     */
    const daemonSet = {
      apiVersion: "apps/v1",
      kind: "DaemonSet",
      metadata: {
        name: collectorName,
        namespace,
        labels: {
          app: collectorName
        }
      },
      spec: {
        selector: {
          matchLabels: {
            app: collectorName,
          }
        },
        updateStrategy: {
          type: "RollingUpdate",
          rollingUpdate: { maxUnavailable: 0, maxSurge: 1 },
        },
        template: {
          metadata: {
            labels: {
              app: collectorName,
            }
          },
          spec: {
            serviceAccountName,
            /**
             * Restrict the DaemonSet to this managed node group.
             * EKS applies this label to managed node group nodes.
             */
            nodeSelector: {
              "eks.amazonaws.com/nodegroup": config.nodeGroupName
            },
            terminationGracePeriodSeconds: 30,
            containers: [
              {
                name: "adot-collector",
                image: props.adotRepository.repositoryUriForTag(config.adotImageTag),
                imagePullPolicy: "Always",
                args: [
                  "--config=/etc/adot/otel-config.yaml",
                ],
                ports: [
                  {
                    name: "otlp-http",
                    containerPort: 4318,
                    protocol: "TCP"
                  },
                  {
                    name: "health",
                    containerPort: 13133,
                    protocol: "TCP",
                  }
                ],
                resources: {
                  requests: {
                    cpu: config.adotCpuRequest,
                    memory: config.adotMemoryLimit
                  },
                  limits: {
                    cpu: config.adotCpuLimit,
                    memory: config.adotMemoryLimit
                  }
                },
                volumeMounts: [
                  {
                    name: "config",
                    mountPath: "/etc/adot",
                    readOnly: true
                  }
                ],
                readinessProbe: {
                  httpGet: {
                    path: "/",
                    port: 13133
                  },
                  initialDelaySeconds: 5,
                  periodSeconds: 10,
                  timeoutSeconds: 3,
                  failureThreshold: 3
                },
                livenessProbe: {
                  httpGet: {
                    path: "/",
                    port: 13133
                  },
                  initialDelaySeconds: 10,
                  periodSeconds: 30,
                  timeoutSeconds: 3,
                  failureThreshold: 3
                }
              }
            ],
            volumes: [
              {
                name: "config",
                configMap: {
                  name: `${collectorName}-config`
                }
              }
            ]
          }
        }
      },
    };

    /**
     * ADOT Service
     * 
     * Provides stable ADOT endpoint for applications
     */
    const service = {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name: collectorName,
        namespace,
      },
      spec: {
        type: "ClusterIP",
        selector: {
          app: collectorName
        },
        trafficDistribution: "PreferSameNode",
        ports: [
          {
            name: "otlp-http",
            port: 4318,
            targetPort: 4318,
            protocol: "TCP"
          }
        ]
      }
    };

    const manifest = this.cluster.addManifest(
      "AdotCollectorDaemonSet",
      configMap,
      daemonSet,
      service
    );

    manifest.node.addDependency(this.nodeGroup);
    manifest.node.addDependency(podIdentityAgent);
    manifest.node.addDependency(serviceAccount);
    manifest.node.addDependency(podIdentityAssociation);

    return manifest;
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
            topologySpreadConstraints: [
              {
                maxSkew: 1,
                topologyKey: "topology.kubernetes.io/zone",
                whenUnsatisfiable: "ScheduleAnyway",
                labelSelector: {
                  matchLabels: {
                    app: config.appName
                  }
                }
              },
              {
                maxSkew: 1,
                topologyKey: "kubernetes.io/hostname",
                whenUnsatisfiable: "ScheduleAnyway",
                labelSelector: {
                  matchLabels: {
                    app: config.appName
                  }
                }
              }
            ],
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
                  { name: "OTEL_EXPORTER_OTLP_ENDPOINT", value: "http://localhost:4318" },
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

    const podDisruptionBudget = {
      apiVersion: "policy/v1",
      kind: "PodDisruptionBudget",

      metadata: {
        name: `${config.appName}-pdb`,
        namespace: config.namespace
      },

      spec: {
        minAvailable: "50%",

        selector: {
          matchLabels: {
            app: config.appName
          }
        }
      }
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
      podDisruptionBudget,
      targetGroupBinding,
    );
  }
}
