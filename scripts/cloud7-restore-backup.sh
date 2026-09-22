#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
FIRESTORE_DATABASE="${API_GCP_FIRESTORE_DATABASE:-(default)}"
SOURCE_BUCKET="${API_GCP_TEMPLATE_BUCKET:-pdf-gen-509308-document-builder-assets}"
BACKUP_BUCKET="${BACKUP_BUCKET:-}"
BACKUP_ROOT="${BACKUP_ROOT:-document-builder-backups}"
BACKUP_STAMP="${BACKUP_STAMP:-}"
CONFIRM_RESTORE="${CONFIRM_RESTORE:-}"

[[ -n "$BACKUP_BUCKET" ]] || { echo "ERROR: BACKUP_BUCKET is required." >&2; exit 1; }
[[ -n "$BACKUP_STAMP" ]] || { echo "ERROR: BACKUP_STAMP is required." >&2; exit 1; }
[[ "$BACKUP_BUCKET" != "$SOURCE_BUCKET" ]] || { echo "ERROR: backup and source buckets must differ." >&2; exit 1; }

BACKUP_URI="gs://$BACKUP_BUCKET/$BACKUP_ROOT/$BACKUP_STAMP"
FIRESTORE_URI="$BACKUP_URI/firestore"
GCS_URI="$BACKUP_URI/gcs"

echo "CLOUD-7.4 restore target"
echo "Project: $PROJECT_ID"
echo "Firestore database: $FIRESTORE_DATABASE"
echo "Source bucket: gs://$SOURCE_BUCKET"
echo "Backup snapshot: $BACKUP_URI"

gcloud storage cat "$BACKUP_URI/manifest.txt" --project="$PROJECT_ID" >/dev/null || {
  echo "ERROR: backup manifest not found." >&2
  exit 1
}

if [[ "$CONFIRM_RESTORE" != "RESTORE" ]]; then
  echo
  echo "DRY RUN ONLY — no data changed."
  echo "To perform restore, rerun with CONFIRM_RESTORE=RESTORE."
  echo "Firestore import restores exported documents but does not delete unrelated newer documents."
  echo "GCS copy restores snapshot objects but does not delete unrelated newer objects."
  exit 0
fi

echo
echo "[1/2] Importing Firestore backup..."
gcloud firestore import "$FIRESTORE_URI"   --project="$PROJECT_ID"   --database="$FIRESTORE_DATABASE"   --collection-ids=documentBuilderTemplates,versions,documentBuilderIdempotency

echo
echo "[2/2] Restoring GCS snapshot objects..."
gcloud storage rsync "$GCS_URI" "gs://$SOURCE_BUCKET"   --recursive   --project="$PROJECT_ID"

echo
echo "CLOUD-7.4 restore PASS"
echo "Run hosted auth/generation/idempotency verification before declaring recovery complete."
