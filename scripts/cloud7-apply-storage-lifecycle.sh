#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
SOURCE_BUCKET="${API_GCP_TEMPLATE_BUCKET:-pdf-gen-509308-document-builder-assets}"
BACKUP_BUCKET="${BACKUP_BUCKET:-pdf-gen-509308-document-builder-backups}"
APPLY_COST_CONTROLS="${APPLY_COST_CONTROLS:-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_RULES="$ROOT_DIR/config/cloud7-source-bucket-lifecycle.json"
BACKUP_RULES="$ROOT_DIR/config/cloud7-backup-bucket-lifecycle.json"

echo "Source bucket: gs://$SOURCE_BUCKET"
echo "Backup bucket: gs://$BACKUP_BUCKET"
echo "Source lifecycle: retain live objects; delete noncurrent versions after 14 days or when 3 newer versions exist."
echo "Backup lifecycle: delete snapshot objects after 30 days."

if [[ "$APPLY_COST_CONTROLS" != "APPLY" ]]; then
  echo
  echo "DRY RUN ONLY — no lifecycle configuration changed."
  echo "To apply, rerun with APPLY_COST_CONTROLS=APPLY."
  exit 0
fi

gcloud storage buckets update "gs://$SOURCE_BUCKET"   --project="$PROJECT_ID"   --lifecycle-file="$SOURCE_RULES"

gcloud storage buckets update "gs://$BACKUP_BUCKET"   --project="$PROJECT_ID"   --lifecycle-file="$BACKUP_RULES"

echo
echo "CLOUD-7.5 storage lifecycle controls applied."
