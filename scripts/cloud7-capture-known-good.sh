#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"

REVISION="$(gcloud run services describe "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --format='value(status.latestReadyRevisionName)')"
IMAGE="$(gcloud run services describe "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --format='value(spec.template.spec.containers[0].image)')"

[[ -n "$REVISION" ]] || { echo "ERROR: could not resolve latest ready revision." >&2; exit 1; }
[[ -n "$IMAGE" ]] || { echo "ERROR: could not resolve deployed image." >&2; exit 1; }

echo "KNOWN_GOOD_REVISION=$REVISION"
echo "KNOWN_GOOD_IMAGE=$IMAGE"
echo
echo "Save these values in release evidence before deploying a new revision."
