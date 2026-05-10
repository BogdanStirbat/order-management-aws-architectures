#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:?CLUSTER_NAME is required}"
TASK_DEFINITION_ARN="${TASK_DEFINITION_ARN:?TASK_DEFINITION_ARN is required}"
SUBNET_IDS="${SUBNET_IDS:?SUBNET_IDS is required}"
SECURITY_GROUP_ID="${SECURITY_GROUP_ID:?SECURITY_GROUP_ID is required}"

echo "Running migration task..."

RUN_TASK_OUTPUT=$(aws ecs run-task \
  --cluster "$CLUSTER_NAME" \
  --launch-type FARGATE \
  --task-definition "$TASK_DEFINITION_ARN" \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$SECURITY_GROUP_ID],assignPublicIp=DISABLED}")

TASK_ARN=$(echo "$RUN_TASK_OUTPUT" | jq -r '.tasks[0].taskArn')

if [[ "$TASK_ARN" == "null" || -z "$TASK_ARN" ]]; then
  echo "$RUN_TASK_OUTPUT"
  echo "Failed to start migration task"
  exit 1
fi

echo "Migration task started: $TASK_ARN"

aws ecs wait tasks-stopped \
  --cluster "$CLUSTER_NAME" \
  --tasks "$TASK_ARN"

DESCRIBE_OUTPUT=$(aws ecs describe-tasks \
  --cluster "$CLUSTER_NAME" \
  --tasks "$TASK_ARN")

EXIT_CODE=$(echo "$DESCRIBE_OUTPUT" | jq -r '.tasks[0].containers[0].exitCode')
STOPPED_REASON=$(echo "$DESCRIBE_OUTPUT" | jq -r '.tasks[0].stoppedReason')

echo "Migration task stopped: $STOPPED_REASON"
echo "Migration task exit code: $EXIT_CODE"

if [[ "$EXIT_CODE" != "0" ]]; then
  echo "$DESCRIBE_OUTPUT"
  echo "Migration failed"
  exit 1
fi

echo "Migration completed successfully"