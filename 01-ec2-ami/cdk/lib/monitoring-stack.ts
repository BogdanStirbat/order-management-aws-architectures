import * as cdk from "aws-cdk-lib";
import { Stack, StackProps, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as logs from "aws-cdk-lib/aws-logs";

export interface MonitoringStackProps extends StackProps {
  targetGroup: elbv2.IApplicationTargetGroup;
  db: rds.IDatabaseInstance;

  /**
   * Optional. If provided, alarms notify via email.
   * Suggest passing via CDK context: -c alarmEmail=you@example.com
   */
  alarmEmail?: string;
}

export class MonitoringStack extends Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { targetGroup, db, alarmEmail } = props;

    // Log Groups
    const appLogGroup = new logs.LogGroup(this, "OrdersAppLogGroup", {
      logGroupName: "/orders-app/app",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const systemLogGroup = new logs.LogGroup(this, "OrdersSystemLogGroup", {
      logGroupName: "/orders-app/system",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Notifications
    const topic = new sns.Topic(this, "AlarmsTopic", {
      topicName: "orders-app-alarms",
      displayName: "Orders App Alarms",
    });

    if (alarmEmail) {
      topic.addSubscription(new subs.EmailSubscription(alarmEmail));
    }

    const notify = new cwActions.SnsAction(topic);

    // ---- Alarms (minimal, high-signal) ----

    // 1) Target group has unhealthy hosts (service impact)
    const unhealthyHostsAlarm = new cloudwatch.Alarm(this, "UnhealthyHostsAlarm", {
      alarmName: "orders-app-tg-unhealthy-hosts",
      metric: targetGroup.metrics.unhealthyHostCount({
        period: Duration.minutes(1),
        statistic: "Maximum",
      }),
      threshold: 0,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    unhealthyHostsAlarm.addAlarmAction(notify);

    // 2) Targets returning 5xx (app errors)
    const target5xxAlarm = new cloudwatch.Alarm(this, "Target5xxAlarm", {
      alarmName: "orders-app-tg-5xx",
      metric: targetGroup.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
        period: Duration.minutes(1),
        statistic: "Sum",
      }),
      threshold: 1,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    target5xxAlarm.addAlarmAction(notify);

    // p95 latency (user experience)
    // TargetResponseTime is in seconds.
    const p95LatencyAlarm = new cloudwatch.Alarm(this, "P95LatencyAlarm", {
      alarmName: "orders-app-tg-latency-p95-high",
      metric: targetGroup.metrics.targetResponseTime({
        period: Duration.minutes(1),
        statistic: "p95",
      }),
      threshold: 1.0, // seconds
      evaluationPeriods: 3,
      datapointsToAlarm: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    p95LatencyAlarm.addAlarmAction(notify);

    // 3) RDS storage low (classic production failure mode)
    const rdsFreeStorageAlarm = new cloudwatch.Alarm(this, "RdsFreeStorageAlarm", {
      alarmName: "orders-app-rds-free-storage-low",
      metric: db.metricFreeStorageSpace({
        period: Duration.minutes(5),
        statistic: "Minimum",
      }),
      // 5 GiB in bytes
      threshold: 5 * 1024 * 1024 * 1024,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    rdsFreeStorageAlarm.addAlarmAction(notify);

    // ---- Dashboard (minimal) ----
    const dashboard = new cloudwatch.Dashboard(this, "OrdersAppDashboard", {
      dashboardName: "orders-app",
    });

    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown:
          `# Orders App\n` +
          `**Target Group:** ${targetGroup.targetGroupName}\n\n` +
          `**RDS:** ${db.instanceIdentifier}`,
        width: 24,
        height: 4,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "ALB Target Group: Healthy/Unhealthy Hosts",
        left: [
          targetGroup.metrics.healthyHostCount({ period: Duration.minutes(1), statistic: "Minimum" }),
          targetGroup.metrics.unhealthyHostCount({ period: Duration.minutes(1), statistic: "Maximum" }),
        ],
        width: 24,
        height: 6,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "ALB Target Group: Requests & 5xx",
        left: [
          targetGroup.metrics.requestCount({ period: Duration.minutes(1), statistic: "Sum" }),
          targetGroup.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
            period: Duration.minutes(1),
            statistic: "Sum",
          }),
        ],
        width: 24,
        height: 6,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "ALB Target Group: TargetResponseTime p95 (seconds)",
        left: [
          targetGroup.metrics.targetResponseTime({
            period: Duration.minutes(1),
            statistic: "p95",
          }),
        ],
        width: 24,
        height: 6,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "RDS: CPU & Free Storage",
        left: [
          db.metricCPUUtilization({ period: Duration.minutes(5), statistic: "Average" }),
        ],
        right: [
          db.metricFreeStorageSpace({ period: Duration.minutes(5), statistic: "Minimum" }),
        ],
        width: 24,
        height: 6,
      })
    );

    new cdk.CfnOutput(this, "AlarmsTopicArn", { value: topic.topicArn });
    new cdk.CfnOutput(this, "DashboardName", { value: dashboard.dashboardName });
    new cdk.CfnOutput(this, "AppLogGroupName", { value: appLogGroup.logGroupName });
    new cdk.CfnOutput(this, "SystemLogGroupName", { value: systemLogGroup.logGroupName });
  }
}
