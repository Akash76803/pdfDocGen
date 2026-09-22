#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"
RUNTIME_SA="${RUNTIME_SA:-pdf-doc-gen-api@${PROJECT_ID}.iam.gserviceaccount.com}"
AUTH_SECRET="${AUTH_SECRET:-pdf-doc-gen-api-auth-token}"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "ERROR: run this from the pdfDocGen repository." >&2
  exit 1
}

HEAD_SHA="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short=8 HEAD)"

CURRENT_IMAGE="$(gcloud run services describe "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --format='value(spec.template.spec.containers[0].image)')"

[[ -n "$CURRENT_IMAGE" ]] || {
  echo "ERROR: could not resolve current Cloud Run image." >&2
  exit 1
}

IMAGE_BASE="${CURRENT_IMAGE%@*}"
if [[ "$IMAGE_BASE" == "$CURRENT_IMAGE" ]]; then
  IMAGE_BASE="${CURRENT_IMAGE%:*}"
fi

IMAGE="${IMAGE_BASE}:cloud5-${SHORT_SHA}"

SECRET_VERSION="$(gcloud secrets versions list "$AUTH_SECRET"   --project="$PROJECT_ID"   --filter='state=ENABLED'   --sort-by='~createTime'   --limit=1   --format='value(name)')"

[[ "$SECRET_VERSION" =~ ^[0-9]+$ ]] || {
  echo "ERROR: could not resolve numeric enabled secret version." >&2
  exit 1
}

echo "Building CLOUD-5 image from commit: $HEAD_SHA"
echo "Target image: $IMAGE"
gcloud builds submit   --project="$PROJECT_ID"   --tag="$IMAGE"   .

echo "Deploying CLOUD-5 image to private staging..."
gcloud run deploy "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --image="$IMAGE"   --service-account="$RUNTIME_SA"   --update-env-vars=API_AUTH_MODE=static-bearer   --set-secrets="API_AUTH_STATIC_BEARER_TOKEN=$AUTH_SECRET:$SECRET_VERSION"   --revision-suffix="cloud5-${SHORT_SHA}"

echo
echo "Deployed image:"
gcloud run services describe "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --format='value(spec.template.spec.containers[0].image,status.latestReadyRevisionName)'

echo
echo "Running security audit..."
bash scripts/cloud5-security-audit.sh

echo
echo "CLOUD-5 code deployment PASS. Next run:"
echo "  bash scripts/cloud5-hosted-auth-smoke.sh"
