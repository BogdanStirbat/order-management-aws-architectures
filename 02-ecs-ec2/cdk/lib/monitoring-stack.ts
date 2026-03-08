import * as cdk from "aws-cdk-lib";
import { Stack, StackProps, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";

import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";

import type { OrdersAppConfig } from "./config";

export interface MonitoringStackProps extends StackProps {
  cluster: ecs.Cluster;
  service: ecs.Ec2Service;
  alb: elbv2.ApplicationLoadBalancer;
  targetGroup: elbv2.ApplicationTargetGroup;
  db: rds.DatabaseInstance;
  appLogGroup: logs.ILogGroup;
  config: OrdersAppConfig;
}

export class MonitoringStack extends Stack {
  public readonly dashboard: cloudwatch.Dashboard;
  public readonly alarmTopic?: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const {
      cluster,
      service,
      alb,
      targetGroup,
      db,
      appLogGroup,
      config,
    } = props;

    //
    // SNS topic for alarm notifications (optional)
    //
    if (config.alarmEmail) {
      this.alarmTopic = new sns.Topic(this, "AlarmTopic", {
        topicName: "orders-app-alarms",
        displayName: "Orders App Alarms",
      });

      this.alarmTopic.addSubscription(new subs.EmailSubscription(config.alarmEmail));
    }

    const addAlarmActions = (alarm: cloudwatch.Alarm) => {
      if (this.alarmTopic) {
        alarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));
        alarm.addOkAction(new cloudwatchActions.SnsAction(this.alarmTopic));
      }
    };

    //
    // ECS alarms
    //
    const ecsCpuAlarm = new cloudwatch.Alarm(this, "EcsHighCpuAlarm", {
      alarmName: "orders-app-ecs-high-cpu",
      metric: service.metricCpuUtilization({
        period: Duration.minutes(5),
        statistic: "Average",
      }),
      threshold: 80,
      evaluationPeriods: 3,
      datapointsToAlarm: 3,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "ECS service CPU utilization is too high",
    });
    addAlarmActions(ecsCpuAlarm);

    const ecsMemoryAlarm = new cloudwatch.Alarm(this, "EcsHighMemoryAlarm", {
      alarmName: "orders-app-ecs-high-memory",
      metric: service.metricMemoryUtilization({
        period: Duration.minutes(5),
        statistic: "Average",
      }),
      threshold: 80,
      evaluationPeriods: 3,
      datapointsToAlarm: 3,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "ECS service memory utilization is too high",
    });
    addAlarmActions(ecsMemoryAlarm);

    //
    // ALB / target group alarms
    //
    const alb5xxAlarm = new cloudwatch.Alarm(this, "AlbTarget5xxAlarm", {
      alarmName: "orders-app-alb-target-5xx",
      metric: targetGroup.metricHttpCodeTarget(
        elbv2.HttpCodeTarget.TARGET_5XX_COUNT,
        {
          period: Duration.minutes(5),
          statistic: "Sum",
        }
      ),
      threshold: 5,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "Too many 5XX responses returned by targets",
    });
    addAlarmActions(alb5xxAlarm);

    const unhealthyHostsAlarm = new cloudwatch.Alarm(this, "UnhealthyHostsAlarm", {
      alarmName: "orders-app-unhealthy-targets",
      metric: targetGroup.metricUnhealthyHostCount({
        period: Duration.minutes(1),
        statistic: "Average",
      }),
      threshold: 1,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "One or more ALB targets are unhealthy",
    });
    addAlarmActions(unhealthyHostsAlarm);

    const targetResponseTimeAlarm = new cloudwatch.Alarm(
      this,
      "TargetResponseTimeAlarm",
      {
        alarmName: "orders-app-target-response-time",
        metric: targetGroup.metricTargetResponseTime({
          period: Duration.minutes(5),
          statistic: "Average",
        }),
        threshold: 2, // seconds
        evaluationPeriods: 3,
        datapointsToAlarm: 3,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: "ALB target response time is too high",
      }
    );
    addAlarmActions(targetResponseTimeAlarm);

    //
    // RDS alarms
    //
    const rdsCpuAlarm = new cloudwatch.Alarm(this, "RdsHighCpuAlarm", {
      alarmName: "orders-app-rds-high-cpu",
      metric: db.metricCPUUtilization({
        period: Duration.minutes(5),
        statistic: "Average",
      }),
      threshold: 80,
      evaluationPeriods: 3,
      datapointsToAlarm: 3,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "RDS CPU utilization is too high",
    });
    addAlarmActions(rdsCpuAlarm);

    const rdsConnectionsAlarm = new cloudwatch.Alarm(
      this,
      "RdsHighConnectionsAlarm",
      {
        alarmName: "orders-app-rds-high-connections",
        metric: db.metricDatabaseConnections({
          period: Duration.minutes(5),
          statistic: "Average",
        }),
        threshold: 80,
        evaluationPeriods: 3,
        datapointsToAlarm: 3,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: "RDS connections are too high",
      }
    );
    addAlarmActions(rdsConnectionsAlarm);

    const rdsFreeStorageAlarm = new cloudwatch.Alarm(
      this,
      "RdsLowFreeStorageAlarm",
      {
        alarmName: "orders-app-rds-low-free-storage",
        metric: db.metricFreeStorageSpace({
          period: Duration.minutes(5),
          statistic: "Average",
        }),
        threshold: 5 * 1024 * 1024 * 1024, // 5 GiB
        evaluationPeriods: 3,
        datapointsToAlarm: 3,
        comparisonOperator:
          cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: "RDS free storage is low",
      }
    );
    addAlarmActions(rdsFreeStorageAlarm);

    const rdsFreeableMemoryAlarm = new cloudwatch.Alarm(
      this,
      "RdsLowFreeableMemoryAlarm",
      {
        alarmName: "orders-app-rds-low-freeable-memory",
        metric: db.metricFreeableMemory({
          period: Duration.minutes(5),
          statistic: "Average",
        }),
        threshold: 256 * 1024 * 1024, // 256 MiB
        evaluationPeriods: 3,
        datapointsToAlarm: 3,
        comparisonOperator:
          cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: "RDS freeable memory is low",
      }
    );
    addAlarmActions(rdsFreeableMemoryAlarm);

    //
    // Log-based metric: ERROR count from application logs
    //
    new logs.MetricFilter(this, "AppErrorMetricFilter", {
      logGroup: appLogGroup,
      metricNamespace: "OrdersApp",
      metricName: "ApplicationErrorCount",
      filterPattern: logs.FilterPattern.anyTerm("ERROR", "Exception"),
      metricValue: "1",
      defaultValue: 0,
    });

    const appErrorMetric = new cloudwatch.Metric({
      namespace: "OrdersApp",
      metricName: "ApplicationErrorCount",
      statistic: "Sum",
      period: Duration.minutes(5),
    });

    const appErrorAlarm = new cloudwatch.Alarm(this, "AppErrorAlarm", {
      alarmName: "orders-app-application-errors",
      metric: appErrorMetric,
      threshold: 5,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "Application logs contain too many ERROR/Exception events",
    });
    addAlarmActions(appErrorAlarm);

    //
    // Dashboard
    //
    this.dashboard = new cloudwatch.Dashboard(this, "OrdersAppDashboard", {
      dashboardName: "orders-app-dashboard",
      defaultInterval: Duration.hours(6),
    });

    this.dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# Orders App Monitoring

Environment:
- ECS Cluster: ${cluster.clusterName}
- ECS Service: ${service.serviceName}
- App Port: ${config.appPort}
- Health Endpoint: ${config.healthCheckPath}
`,
        width: 24,
        height: 5,
      })
    );

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "ALB - Target Response Time",
        left: [
          targetGroup.metricTargetResponseTime({
            period: Duration.minutes(5),
            statistic: "Average",
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: "ALB - 5XX and Unhealthy Hosts",
        left: [
          targetGroup.metricHttpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
            period: Duration.minutes(5),
            statistic: "Sum",
          }),
          targetGroup.metricUnhealthyHostCount({
            period: Duration.minutes(1),
            statistic: "Average",
          }),
        ],
        width: 12,
      })
    );

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "ECS Service - CPU %",
        left: [
          service.metricCpuUtilization({
            period: Duration.minutes(5),
            statistic: "Average",
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: "ECS Service - Memory %",
        left: [
          service.metricMemoryUtilization({
            period: Duration.minutes(5),
            statistic: "Average",
          }),
        ],
        width: 12,
      })
    );

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "RDS - CPU and Connections",
        left: [
          db.metricCPUUtilization({
            period: Duration.minutes(5),
            statistic: "Average",
          }),
          db.metricDatabaseConnections({
            period: Duration.minutes(5),
            statistic: "Average",
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: "RDS - Free Storage / Freeable Memory",
        left: [
          db.metricFreeStorageSpace({
            period: Duration.minutes(5),
            statistic: "Average",
          }),
          db.metricFreeableMemory({
            period: Duration.minutes(5),
            statistic: "Average",
          }),
        ],
        width: 12,
      })
    );

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Application Errors from Logs",
        left: [appErrorMetric],
        width: 24,
      })
    );

    new cdk.CfnOutput(this, "DashboardName", {
      value: this.dashboard.dashboardName,
    });

    if (this.alarmTopic) {
      new cdk.CfnOutput(this, "AlarmTopicArn", {
        value: this.alarmTopic.topicArn,
      });
    }
  }
}