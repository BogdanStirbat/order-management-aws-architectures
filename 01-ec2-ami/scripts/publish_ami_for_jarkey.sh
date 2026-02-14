#!/usr/bin/env bash
set -euo pipefail

JARKEY_POINTER_PARAM="/orders-app/build/jarKey"
LATEST_AMI_PARAM="/orders-app/ami/latest"
APP_TAG_VALUE="orders-app"

if [[ $# -lt 1 || $# -gt 2 ]]; then
    echo "Usage: $0 aws_profile [JAR_KEY]"
    exit 1
fi

AWS_PROFILE="$1"

# ---------------- helpers ----------------
die() {
  echo "ERROR: $*" >&2
  exit 1
}

aws_cli() {
  aws --profile "$AWS_PROFILE" "$@"
}

# Optional: pass jarKey explicitly as arg
# ./publish_ami_for_jarkey.sh "releases/1.2.1/app.jar"
JAR_KEY="${2:-}"

# ---------------- determine jarKey ----------------
if [[ -z "$JAR_KEY" ]]; then
  JAR_KEY="$(aws_cli ssm get-parameter \
    --name "$JARKEY_POINTER_PARAM" \
    --query 'Parameter.Value' \
    --output text)"
fi

[[ -n "$JAR_KEY" && "$JAR_KEY" != "null" ]] \
  || die "jarKey is empty (arg or $JARKEY_POINTER_PARAM)"

TARGET_AMI_PARAM="/orders-app/ami/${JAR_KEY}"

# ---------------- read latest AMI ----------------
AMI_ID="$(aws_cli ssm get-parameter \
  --name "$LATEST_AMI_PARAM" \
  --query 'Parameter.Value' \
  --output text)"

[[ "$AMI_ID" =~ ^ami-[0-9a-fA-F]{8,}$ ]] \
  || die "Invalid AMI id from $LATEST_AMI_PARAM: $AMI_ID"

# ---------------- verify AMI exists ----------------
FOUND_AMI_ID="$(aws_cli ec2 describe-images \
  --image-ids "$AMI_ID" \
  --query 'Images[0].ImageId' \
  --output text 2>/dev/null || true)"

[[ "$FOUND_AMI_ID" == "$AMI_ID" ]] \
  || die "AMI $AMI_ID not found or inaccessible"

# ---------------- tag AMI ----------------
aws_cli ec2 create-tags \
  --resources "$AMI_ID" \
  --tags \
    "Key=JarKey,Value=${JAR_KEY}" \
    "Key=App,Value=${APP_TAG_VALUE}" \
    "Key=ManagedBy,Value=imagebuilder"

# ---------------- find snapshots ----------------
SNAPSHOT_IDS="$(aws_cli ec2 describe-images \
  --image-ids "$AMI_ID" \
  --query 'Images[0].BlockDeviceMappings[].Ebs.SnapshotId' \
  --output text)"

if [[ -z "$SNAPSHOT_IDS" ]]; then
  die "No snapshots found for AMI $AMI_ID"
fi

# ---------------- tag snapshots ----------------
aws_cli ec2 create-tags \
  --resources $SNAPSHOT_IDS \
  --tags \
    "Key=JarKey,Value=${JAR_KEY}" \
    "Key=App,Value=${APP_TAG_VALUE}" \
    "Key=ManagedBy,Value=imagebuilder"

# ---------------- publish immutable mapping ----------------
aws_cli ssm put-parameter \
  --name "$TARGET_AMI_PARAM" \
  --type "String" \
  --value "$AMI_ID" \
  --overwrite \
  --tier "Standard" \
  --description "Orders app AMI for ${JAR_KEY}"

# ---------------- summary ----------------
echo "SUCCESS"
echo "  jarKey:      ${JAR_KEY}"
echo "  amiId:       ${AMI_ID}"
echo "  snapshots:   ${SNAPSHOT_IDS}"
echo "  wrote param: ${TARGET_AMI_PARAM}"
echo "  tags added:  JarKey=${JAR_KEY}"
