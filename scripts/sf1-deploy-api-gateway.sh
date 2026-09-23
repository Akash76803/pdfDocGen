#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"
API_ID="${API_ID:-pdf-doc-gen-api}"
GATEWAY_ID="${GATEWAY_ID:-pdf-doc-gen-gateway}"
GATEWAY_SA_NAME="${GATEWAY_SA_NAME:-pdf-doc-gen-gateway}"
OPENAPI_SPEC="${OPENAPI_SPEC:-deploy/api-gateway-openapi.yaml}"
CONFIG_ID="${CONFIG_ID:-sf1-$(date -u +%Y%m%d-%H%M%S)}"
GATEWAY_SA="${GATEWAY_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "[1/6] Enable API Gateway services"
gcloud services enable \
  apigateway.googleapis.com \
  servicemanagement.googleapis.com \
  servicecontrol.googleapis.com \
  --project="$PROJECT_ID"

echo "[2/6] Ensure gateway service account"
if ! gcloud iam service-accounts describe "$GATEWAY_SA" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$GATEWAY_SA_NAME" \
    --project="$PROJECT_ID" \
    --display-name="pdfDocGen API Gateway backend identity"
fi

echo "[3/6] Grant gateway permission to invoke private Cloud Run"
gcloud run services add-iam-policy-binding "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --member="serviceAccount:$GATEWAY_SA" \
  --role="roles/run.invoker" >/dev/null

echo "[4/6] Ensure API resource"
if ! gcloud api-gateway apis describe "$API_ID" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud api-gateway apis create "$API_ID" --project="$PROJECT_ID"
fi

echo "[5/6] Create immutable API config: $CONFIG_ID"
gcloud api-gateway api-configs create "$CONFIG_ID" \
  --api="$API_ID" \
  --openapi-spec="$OPENAPI_SPEC" \
  --project="$PROJECT_ID" \
  --backend-auth-service-account="$GATEWAY_SA"

echo "[6/6] Create or update gateway"
if gcloud api-gateway gateways describe "$GATEWAY_ID" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud api-gateway gateways update "$GATEWAY_ID" \
    --api="$API_ID" \
    --api-config="$CONFIG_ID" \
    --location="$REGION" \
    --project="$PROJECT_ID"
else
  gcloud api-gateway gateways create "$GATEWAY_ID" \
    --api="$API_ID" \
    --api-config="$CONFIG_ID" \
    --location="$REGION" \
    --project="$PROJECT_ID"
fi

HOSTNAME="$(gcloud api-gateway gateways describe "$GATEWAY_ID" \
  --location="$REGION" \
  --project="$PROJECT_ID" \
  --format='value(defaultHostname)')"

echo
echo "SF-1.1 API Gateway deployment complete."
echo "Gateway hostname: $HOSTNAME"
echo "Gateway base URL: https://$HOSTNAME"
echo "Cloud Run remains private."
echo "Next: deploy the gateway-compatible API code, then test /health and authenticated document generation through the gateway."
