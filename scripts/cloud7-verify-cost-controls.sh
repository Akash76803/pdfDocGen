#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"
SOURCE_BUCKET="${API_GCP_TEMPLATE_BUCKET:-pdf-gen-509308-document-builder-assets}"
BACKUP_BUCKET="${BACKUP_BUCKET:-pdf-gen-509308-document-builder-backups}"
LOG_LOCATION="${LOG_LOCATION:-global}"
LOG_BUCKET="${LOG_BUCKET:-_Default}"

echo "CLOUD-7.5 cost-control readiness"
echo "Project: $PROJECT_ID"

MAX_SCALE="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(metadata.annotations.run.googleapis.com/maxScale)')"
echo "Cloud Run service max instances: ${MAX_SCALE:-unset}"
[[ "${MAX_SCALE:-}" == "10" ]] && echo "PASS: Cloud Run service max instances = 10" || echo "WARN: expected service max instances 10"

SOURCE_VERSIONING="$(gcloud storage buckets describe "gs://$SOURCE_BUCKET" --project="$PROJECT_ID" --format='value(versioning_enabled)' | tr '[:upper:]' '[:lower:]')"
[[ "$SOURCE_VERSIONING" == "true" ]] && echo "PASS: source bucket versioning enabled" || echo "WARN: source bucket versioning not enabled"

gcloud storage buckets describe "gs://$BACKUP_BUCKET" --project="$PROJECT_ID" >/dev/null
echo "PASS: backup bucket accessible"

RETENTION="$(gcloud logging buckets describe "$LOG_BUCKET" --location="$LOG_LOCATION" --project="$PROJECT_ID" --format='value(retentionDays)')"
echo "Logging $LOG_BUCKET retention: ${RETENTION:-unknown} days"
if [[ "${RETENTION:-}" == "30" ]]; then
  echo "PASS: default log retention = 30 days"
else
  echo "INFO: log retention differs from staging baseline of 30 days"
fi

BILLING_ACCOUNT="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)' 2>/dev/null || true)"
if [[ -n "$BILLING_ACCOUNT" ]]; then
  echo "PASS: project linked to billing account $BILLING_ACCOUNT"
else
  echo "WARN: linked billing account could not be resolved"
fi

echo
echo "CLOUD-7.5 cost-control readiness complete"
