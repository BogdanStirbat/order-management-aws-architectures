import * as cdk from "aws-cdk-lib";
import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as logs from "aws-cdk-lib/aws-logs";
import type { OrdersAppConfig } from "./config";

export interface MonitoringStackProps extends StackProps {
  httpApi: apigwv2.HttpApi;
  apiAccessLogGroup: logs.ILogGroup;

  ordersFunction: lambda.IFunction;
  ordersAlias: lambda.IFunction;

  ordersTable: dynamodb.TableV2;

  config: OrdersAppConfig;
}

export class MonitoringStack extends Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const alarmTopic = new sns.Topic(this, "OrdersAlarmTopic", {
      topicName: "orders-app-alarms",
    });

    if (props.config.alarmEmail) {
      alarmTopic.addSubscription(
        new subscriptions.EmailSubscription(props.config.alarmEmail)
      );
    }

    const alarmAction = new actions.SnsAction(alarmTopic);

    const addAlarmAction = (alarm: cloudwatch.Alarm) => {
      alarm.addAlarmAction(alarmAction);
      alarm.addOkAction(alarmAction);
    };

    /*
     * Lambda alarms
     */

    addAlarmAction(new cloudwatch.Alarm(this, "OrdersLambdaErrorsAlarm", {
      alarmName: "orders-api-lambda-errors",
      alarmDescription: "Orders Lambda has application errors.",
      metric: props.ordersAlias.metricErrors({
        period: Duration.minutes(5),
        statistic: "sum",
      }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }));

    addAlarmAction(new cloudwatch.Alarm(this, "OrdersLambdaThrottlesAlarm", {
      alarmName: "orders-api-lambda-throttles",
      alarmDescription: "Orders Lambda is being throttled.",
      metric: props.ordersAlias.metricThrottles({
        period: Duration.minutes(5),
        statistic: "sum",
      }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }));

    addAlarmAction(new cloudwatch.Alarm(this, "OrdersLambdaDurationP95Alarm", {
      alarmName: "orders-api-lambda-duration-p95",
      alarmDescription: "Orders Lambda p95 duration is high.",
      metric: props.ordersAlias.metricDuration({
        period: Duration.minutes(5),
        statistic: "p95",
      }),
      // Your Lambda timeout is 30s. Alert before it gets close.
      threshold: 20_000,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }));

    addAlarmAction(new cloudwatch.Alarm(this, "OrdersLambdaConcurrentExecutionsAlarm", {
      alarmName: "orders-api-lambda-concurrent-executions-near-limit",
      alarmDescription: "Orders Lambda concurrency is close to its reserved concurrency limit.",
      metric: new cloudwatch.Metric({
        namespace: "AWS/Lambda",
        metricName: "ConcurrentExecutions",
        dimensionsMap: {
          FunctionName: props.ordersFunction.functionName,
        },
        period: Duration.minutes(1),
        statistic: "max",
      }),
      threshold: Math.max(1, Math.floor(props.config.lambdaReservedConcurrentExecutions * 0.8)),
      evaluationPeriods: 5,
      datapointsToAlarm: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }));

    /*
     * API Gateway HTTP API alarms
     *
     * CDK HttpApi has metric helpers, but raw metrics are more explicit and
     * work well for HTTP API default stage metrics.
     */

    const apiDimensions = {
      ApiId: props.httpApi.apiId,
      Stage: "$default",
    };

    const api5xxRate = new cloudwatch.MathExpression({
      expression: "IF(requests > 0, errors / requests * 100, 0)",
      usingMetrics: {
        errors: new cloudwatch.Metric({
          namespace: "AWS/ApiGateway",
          metricName: "5xx",
          dimensionsMap: apiDimensions,
          period: Duration.minutes(5),
          statistic: "sum",
        }),
        requests: new cloudwatch.Metric({
          namespace: "AWS/ApiGateway",
          metricName: "Count",
          dimensionsMap: apiDimensions,
          period: Duration.minutes(5),
          statistic: "sum",
        }),
      },
      label: "API 5XX rate %",
      period: Duration.minutes(5),
    });

    addAlarmAction(new cloudwatch.Alarm(this, "OrdersApi5xxRateAlarm", {
      alarmName: "orders-api-5xx-rate",
      alarmDescription: "HTTP API 5XX error rate is high.",
      metric: api5xxRate,
      threshold: 1,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }));

    const api4xxRate = new cloudwatch.MathExpression({
      expression: "IF(requests > 0, errors / requests * 100, 0)",
      usingMetrics: {
        errors: new cloudwatch.Metric({
          namespace: "AWS/ApiGateway",
          metricName: "4xx",
          dimensionsMap: apiDimensions,
          period: Duration.minutes(5),
          statistic: "sum",
        }),
        requests: new cloudwatch.Metric({
          namespace: "AWS/ApiGateway",
          metricName: "Count",
          dimensionsMap: apiDimensions,
          period: Duration.minutes(5),
          statistic: "sum",
        }),
      },
      label: "API 4XX rate %",
      period: Duration.minutes(5),
    });

    addAlarmAction(new cloudwatch.Alarm(this, "OrdersApi4xxRateAlarm", {
      alarmName: "orders-api-4xx-rate",
      alarmDescription: "HTTP API 4XX error rate is unusually high.",
      metric: api4xxRate,
      threshold: 20,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }));

    addAlarmAction(new cloudwatch.Alarm(this, "OrdersApiLatencyP95Alarm", {
      alarmName: "orders-api-latency-p95",
      alarmDescription: "HTTP API p95 latency is high.",
      metric: new cloudwatch.Metric({
        namespace: "AWS/ApiGateway",
        metricName: "Latency",
        dimensionsMap: apiDimensions,
        period: Duration.minutes(5),
        statistic: "p95",
      }),
      threshold: 3_000,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }));

    addAlarmAction(new cloudwatch.Alarm(this, "OrdersApiIntegrationLatencyP95Alarm", {
      alarmName: "orders-api-integration-latency-p95",
      alarmDescription: "HTTP API Lambda integration p95 latency is high.",
      metric: new cloudwatch.Metric({
        namespace: "AWS/ApiGateway",
        metricName: "IntegrationLatency",
        dimensionsMap: apiDimensions,
        period: Duration.minutes(5),
        statistic: "p95",
      }),
      threshold: 2_500,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }));

    new logs.MetricFilter(this, "ApiJwtAuthorizerFailureMetricFilter", {
      logGroup: props.apiAccessLogGroup,
      metricNamespace: "OrdersApp",
      metricName: "ApiJwtAuthorizerFailureCount",
      filterPattern: logs.FilterPattern.literal('{ $.authorizerError = "*" }'),
      metricValue: "1",
      defaultValue: 0,
    });

    /* 
     * DynamoDB alarms
     */

    const tableDimensions = {
      TableName: props.ordersTable.tableName,
    };

    addAlarmAction(new cloudwatch.Alarm(this, "OrdersDynamoDbThrottledRequestsAlarm", {
      alarmName: "orders-dynamodb-throttled-requests",
      metric: new cloudwatch.Metric({
        namespace: "AWS/DynamoDB",
        metricName: "ThrottledRequests",
        dimensionsMap: tableDimensions,
        period: Duration.minutes(5),
        statistic: "sum",
      }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }));

    addAlarmAction(new cloudwatch.Alarm(this, "OrdersDynamoDbSystemErrorsAlarm", {
      alarmName: "orders-dynamodb-system-errors",
      metric: new cloudwatch.Metric({
        namespace: "AWS/DynamoDB",
        metricName: "SystemErrors",
        dimensionsMap: tableDimensions,
        period: Duration.minutes(5),
        statistic: "sum",
      }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }));

    new cdk.CfnOutput(this, "AlarmTopicArn", {
      value: alarmTopic.topicArn,
    });
  }
}