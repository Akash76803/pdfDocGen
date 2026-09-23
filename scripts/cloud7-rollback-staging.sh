#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"
TARGET_REVISION="${1:-}"

[[ -n "$TARGET_REVISION" ]] || {
  echo "Usage: bash scripts/cloud7-rollback-staging.sh <known-good-revision>" >&2
  exit 2
}

gcloud run revisions describe "$TARGET_REVISION"   --project="$PROJECT_ID"   --region="$REGION"   --format='value(metadata.name)' >/dev/null

echo "Rolling back $SERVICE to $TARGET_REVISION ..."
gcloud run services update-traffic "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --to-revisions="$TARGET_REVISION=100"

ACTIVE="$(gcloud run services describe "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --format='value(status.traffic[0].revisionName)')"

[[ "$ACTIVE" == "$TARGET_REVISION" ]] || {
  echo "ERROR: traffic did not move to requested revision. active=$ACTIVE" >&2
  exit 1
}

echo
echo "Running rollback verification..."
bash scripts/cloud7-verify-runtime-guardrails.sh
bash scripts/cloud5-security-audit.sh
bash scripts/cloud5-hosted-auth-smoke.sh
bash scripts/cloud7-hosted-idempotency-smoke.sh

echo
echo "CLOUD-7.6 rollback PASS."
echo "100% traffic is on $TARGET_REVISION"
