#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
FIRESTORE_DATABASE="${API_GCP_FIRESTORE_DATABASE:-(default)}"
SOURCE_BUCKET="${API_GCP_TEMPLATE_BUCKET:-pdf-gen-509308-document-builder-assets}"
BACKUP_BUCKET="${BACKUP_BUCKET:-}"
BACKUP_ROOT="${BACKUP_ROOT:-document-builder-backups}"
STAMP="${BACKUP_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"

[[ -n "$BACKUP_BUCKET" ]] || {
  echo "ERROR: BACKUP_BUCKET is required and must be different from SOURCE_BUCKET." >&2
  exit 1
}
[[ "$BACKUP_BUCKET" != "$SOURCE_BUCKET" ]] || {
  echo "ERROR: BACKUP_BUCKET must be separate from SOURCE_BUCKET." >&2
  exit 1
}

command -v gcloud >/dev/null || { echo "ERROR: gcloud is required." >&2; exit 1; }

SOURCE_URI="gs://$SOURCE_BUCKET"
BACKUP_URI="gs://$BACKUP_BUCKET/$BACKUP_ROOT/$STAMP"
FIRESTORE_URI="$BACKUP_URI/firestore"
GCS_URI="$BACKUP_URI/gcs"

echo "CLOUD-7.4 backup"
echo "Project: $PROJECT_ID"
echo "Firestore database: $FIRESTORE_DATABASE"
echo "Source bucket: $SOURCE_URI"
echo "Backup snapshot: $BACKUP_URI"

gcloud storage buckets describe "$SOURCE_URI" --project="$PROJECT_ID" >/dev/null
gcloud storage buckets describe "gs://$BACKUP_BUCKET" --project="$PROJECT_ID" >/dev/null

echo
echo "[1/2] Exporting Firestore metadata/idempotency state..."
gcloud firestore export "$FIRESTORE_URI"   --project="$PROJECT_ID"   --database="$FIRESTORE_DATABASE"   --collection-ids=documentBuilderTemplates,versions,documentBuilderIdempotency

echo
echo "[2/2] Snapshotting GCS template/assets/idempotency objects..."
gcloud storage rsync "$SOURCE_URI" "$GCS_URI"   --recursive   --project="$PROJECT_ID"

cat >"/tmp/cloud7-backup-manifest-$STAMP.txt" <<EOF
project=$PROJECT_ID
firestore_database=$FIRESTORE_DATABASE
source_bucket=$SOURCE_BUCKET
backup_bucket=$BACKUP_BUCKET
backup_root=$BACKUP_ROOT
backup_stamp=$STAMP
firestore_uri=$FIRESTORE_URI
gcs_uri=$GCS_URI
EOF

gcloud storage cp "/tmp/cloud7-backup-manifest-$STAMP.txt" "$BACKUP_URI/manifest.txt" --project="$PROJECT_ID"
rm -f "/tmp/cloud7-backup-manifest-$STAMP.txt"

echo
echo "CLOUD-7.4 backup PASS"
echo "Snapshot: $BACKUP_URI"
