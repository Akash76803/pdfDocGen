#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
FIRESTORE_DATABASE="${API_GCP_FIRESTORE_DATABASE:-(default)}"
SOURCE_BUCKET="${API_GCP_TEMPLATE_BUCKET:-pdf-gen-509308-document-builder-assets}"
BACKUP_BUCKET="${BACKUP_BUCKET:-}"

echo "CLOUD-7.4 backup readiness"
echo "Project: $PROJECT_ID"
echo "Firestore: $FIRESTORE_DATABASE"
echo "Source bucket: $SOURCE_BUCKET"

gcloud firestore databases describe   --project="$PROJECT_ID"   --database="$FIRESTORE_DATABASE"   --format='value(name,type,locationId)' >/dev/null
echo "PASS: Firestore database accessible"

VERSIONING="$(gcloud storage buckets describe "gs://$SOURCE_BUCKET"   --project="$PROJECT_ID"   --format='value(versioning_enabled)' | tr '[:upper:]' '[:lower:]')"
if [[ "$VERSIONING" == "true" ]]; then
  echo "PASS: source GCS bucket versioning enabled"
else
  echo "WARN: source GCS bucket versioning is not enabled"
fi

if [[ -n "$BACKUP_BUCKET" ]]; then
  [[ "$BACKUP_BUCKET" != "$SOURCE_BUCKET" ]] || { echo "FAIL: BACKUP_BUCKET must differ from source bucket" >&2; exit 1; }
  gcloud storage buckets describe "gs://$BACKUP_BUCKET" --project="$PROJECT_ID" >/dev/null
  echo "PASS: separate backup bucket accessible"
else
  echo "WARN: BACKUP_BUCKET not set; snapshot backup cannot run yet"
fi

echo
echo "CLOUD-7.4 readiness check complete"
