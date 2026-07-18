import * as cdk from "aws-cdk-lib";
import { Stack, StackProps, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as eks from "aws-cdk-lib/aws-eks";
import type { OrdersAppConfig } from "./config";

export interface MonitoringStackProps extends StackProps {
  cluster: eks.Cluster;
  alb: elbv2.ApplicationLoadBalancer;
  targetGroup: elbv2.ApplicationTargetGroup;
  db: rds.DatabaseInstance;
  httpApi: apigwv2.HttpApi;
  apiAccessLogGroup: logs.ILogGroup;
  config: OrdersAppConfig;
}

export class MonitoringStack extends Stack {
  public readonly dashboard: cloudwatch.Dashboard;
  public readonly alarmTopic?: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { cluster, targetGroup, db, config } = props;

    if (config.alarmEmail) {
      this.alarmTopic = new sns.Topic(this, "AlarmTopic", {
        topicName: "orders-app-eks-alarms",
        displayName: "Orders App EKS Alarms",
      });
      this.alarmTopic.addSubscription(new subs.EmailSubscription(config.alarmEmail));
    }

    const addAlarmActions = (alarm: cloudwatch.Alarm) => {
      if (this.alarmTopic) {
        alarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));
        alarm.addOkAction(new cloudwatchActions.SnsAction(this.alarmTopic));
      }
    };

    const alb5xxAlarm = new cloudwatch.Alarm(this, "AlbTarget5xxAlarm", {
      alarmName: "orders-app-eks-alb-target-5xx",
      metric: targetGroup.metricHttpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
        period: Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 5,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "Too many 5XX responses returned by EKS pod targets",
    });
    addAlarmActions(alb5xxAlarm);

    const unhealthyHostsAlarm = new cloudwatch.Alarm(this, "UnhealthyHostsAlarm", {
      alarmName: "orders-app-eks-unhealthy-targets",
      metric: targetGroup.metricUnhealthyHostCount({
        period: Duration.minutes(1),
        statistic: "Average",
      }),
      threshold: 1,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "One or more ALB targets are unhealthy",
    });
    addAlarmActions(unhealthyHostsAlarm);

    const targetResponseTimeAlarm = new cloudwatch.Alarm(this, "TargetResponseTimeAlarm", {
      alarmName: "orders-app-eks-target-response-time",
      metric: targetGroup.metricTargetResponseTime({
        period: Duration.minutes(5),
        statistic: "Average",
      }),
      threshold: 2,
      evaluationPeriods: 3,
      datapointsToAlarm: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "ALB target response time is too high",
    });
    addAlarmActions(targetResponseTimeAlarm);

    const rdsCpuAlarm = new cloudwatch.Alarm(this, "RdsHighCpuAlarm", {
      alarmName: "orders-app-eks-rds-high-cpu",
      metric: db.metricCPUUtilization({ period: Duration.minutes(5), statistic: "Average" }),
      threshold: 80,
      evaluationPeriods: 3,
      datapointsToAlarm: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "RDS CPU utilization is too high",
    });
    addAlarmActions(rdsCpuAlarm);

    const rdsConnectionsAlarm = new cloudwatch.Alarm(this, "RdsHighConnectionsAlarm", {
      alarmName: "orders-app-eks-rds-high-connections",
      metric: db.metricDatabaseConnections({ period: Duration.minutes(5), statistic: "Average" }),
      threshold: 80,
      evaluationPeriods: 3,
      datapointsToAlarm: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "RDS connections are too high",
    });
    addAlarmActions(rdsConnectionsAlarm);

    const api4xxAlarm = new cloudwatch.Alarm(this, "ApiGateway4xxAlarm", {
      alarmName: "orders-app-eks-apigw-4xx",
      metric: new cloudwatch.Metric({
        namespace: "AWS/ApiGateway",
        metricName: "4xx",
        dimensionsMap: { ApiId: props.httpApi.apiId, Stage: "$default" },
        statistic: "Sum",
        period: Duration.minutes(5),
      }),
      threshold: 20,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "High API Gateway 4XX responses",
    });
    addAlarmActions(api4xxAlarm);

    const api5xxAlarm = new cloudwatch.Alarm(this, "ApiGateway5xxAlarm", {
      alarmName: "orders-app-eks-apigw-5xx",
      metric: new cloudwatch.Metric({
        namespace: "AWS/ApiGateway",
        metricName: "5xx",
        dimensionsMap: { ApiId: props.httpApi.apiId, Stage: "$default" },
        statistic: "Sum",
        period: Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "High API Gateway 5XX responses",
    });
    addAlarmActions(api5xxAlarm);

    new logs.MetricFilter(this, "ApiJwtAuthorizerFailureMetricFilter", {
      logGroup: props.apiAccessLogGroup,
      metricNamespace: "OrdersApp",
      metricName: "ApiJwtAuthorizerFailureCount",
      filterPattern: logs.FilterPattern.literal('{ $.authorizerError = "*" }'),
      metricValue: "1",
      defaultValue: 0,
    });

    const apiJwtAuthorizerFailureMetric = new cloudwatch.Metric({
      namespace: "OrdersApp",
      metricName: "ApiJwtAuthorizerFailureCount",
      statistic: "Sum",
      period: Duration.minutes(5),
    });

    const apiJwtAuthorizerFailureAlarm = new cloudwatch.Alarm(this, "ApiJwtAuthorizerFailureAlarm", {
      alarmName: "orders-app-eks-apigw-jwt-authorizer-failures",
      metric: apiJwtAuthorizerFailureMetric,
      threshold: 5,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "JWT authorizer failures detected in API Gateway access logs",
    });
    addAlarmActions(apiJwtAuthorizerFailureAlarm);

    this.dashboard = new cloudwatch.Dashboard(this, "OrdersAppDashboard", {
      dashboardName: "orders-app-eks-dashboard",
      defaultInterval: Duration.hours(6),
    });

    this.dashboard.addWidgets(new cloudwatch.TextWidget({
      markdown: `# Orders App EKS Monitoring\n\n- EKS Cluster: ${cluster.clusterName}\n- Namespace: ${config.namespace}\n- App: ${config.appName}\n- App Port: ${config.appPort}\n- Health Endpoint: ${config.healthCheckPath}\n`,
      width: 24,
      height: 5,
    }));

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "ALB - Target Response Time",
        left: [targetGroup.metricTargetResponseTime({ period: Duration.minutes(5), statistic: "Average" })],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: "ALB - 5XX and Unhealthy Targets",
        left: [
          targetGroup.metricHttpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, { period: Duration.minutes(5), statistic: "Sum" }),
          targetGroup.metricUnhealthyHostCount({ period: Duration.minutes(1), statistic: "Average" }),
        ],
        width: 12,
      }),
    );

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "RDS - CPU and Connections",
        left: [
          db.metricCPUUtilization({ period: Duration.minutes(5), statistic: "Average" }),
          db.metricDatabaseConnections({ period: Duration.minutes(5), statistic: "Average" }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: "API Gateway - 4XX / 5XX",
        left: [
          new cloudwatch.Metric({ namespace: "AWS/ApiGateway", metricName: "4xx", dimensionsMap: { ApiId: props.httpApi.apiId, Stage: "$default" }, statistic: "Sum", period: Duration.minutes(5) }),
          new cloudwatch.Metric({ namespace: "AWS/ApiGateway", metricName: "5xx", dimensionsMap: { ApiId: props.httpApi.apiId, Stage: "$default" }, statistic: "Sum", period: Duration.minutes(5) }),
        ],
        width: 12,
      }),
    );

    this.dashboard.addWidgets(new cloudwatch.GraphWidget({
      title: "API Gateway - JWT Authorizer Failures",
      left: [apiJwtAuthorizerFailureMetric],
      width: 24,
    }));

    new cdk.CfnOutput(this, "DashboardName", { value: this.dashboard.dashboardName });
    if (this.alarmTopic) {
      new cdk.CfnOutput(this, "AlarmTopicArn", { value: this.alarmTopic.topicArn });
    }
  }
}
