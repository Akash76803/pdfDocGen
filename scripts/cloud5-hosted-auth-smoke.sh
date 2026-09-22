#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"
AUTH_SECRET="${AUTH_SECRET:-pdf-doc-gen-api-auth-token}"
PORT="${PORT:-8080}"
TEMPLATE_ID="${TEMPLATE_ID:-cloud3-hosted-smoke-20260921}"
TEMPLATE_VERSION="${TEMPLATE_VERSION:-2}"
BASE_URL="http://127.0.0.1:$PORT"
TMP_DIR="$(mktemp -d)"
PROXY_PID=""

cleanup() {
  if [[ -n "$PROXY_PID" ]] && kill -0 "$PROXY_PID" >/dev/null 2>&1; then
    kill "$PROXY_PID" >/dev/null 2>&1 || true
    wait "$PROXY_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

SECRET_VERSION="$(gcloud secrets versions list "$AUTH_SECRET"   --project="$PROJECT_ID"   --filter='state=ENABLED'   --sort-by='~createTime'   --limit=1   --format='value(name)')"

[[ "$SECRET_VERSION" =~ ^[0-9]+$ ]] || {
  echo "ERROR: Could not resolve enabled auth secret version." >&2
  exit 1
}

echo "Starting private Cloud Run proxy..."
gcloud run services proxy "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --port="$PORT" >"$TMP_DIR/proxy.log" 2>&1 &
PROXY_PID=$!

for attempt in {1..45}; do
  if curl --fail --silent "$BASE_URL/health" >"$TMP_DIR/health.json" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$PROXY_PID" >/dev/null 2>&1; then
    cat "$TMP_DIR/proxy.log" >&2
    echo "ERROR: Cloud Run proxy exited before health became ready." >&2
    exit 1
  fi
  sleep 1
done

curl --fail --silent "$BASE_URL/health" >"$TMP_DIR/health.json" || {
  cat "$TMP_DIR/proxy.log" >&2
  echo "ERROR: health check failed." >&2
  exit 1
}
echo "PASS: health"

python3 - "$TMP_DIR/no-token-request.json" "$TEMPLATE_ID" "$TEMPLATE_VERSION" <<'PY'
import json,sys
path, template_id, template_version = sys.argv[1], sys.argv[2], int(sys.argv[3])
with open(path, 'w', encoding='utf-8') as f:
    json.dump({
        "templateId": template_id,
        "templateVersion": template_version,
        "output": {"format": "pdf"},
        "data": {"invoiceNo": "CLOUD5-NO-TOKEN"},
    }, f, separators=(',', ':'))
PY

NO_TOKEN_STATUS="$(curl --silent --show-error   -o "$TMP_DIR/no-token.json"   -w '%{http_code}'   -X POST   -H 'Content-Type: application/json'   "$BASE_URL/api/v1/documents/generate"   --data-binary @"$TMP_DIR/no-token-request.json")"

[[ "$NO_TOKEN_STATUS" == "401" ]] || {
  echo "ERROR: expected no-token HTTP 401, got $NO_TOKEN_STATUS" >&2
  cat "$TMP_DIR/no-token.json" >&2
  exit 1
}

python3 - "$TMP_DIR/no-token.json" <<'PY'
import json,sys
with open(sys.argv[1],encoding='utf-8') as f:
    body=json.load(f)
if body.get('error',{}).get('code') != 'UNAUTHORIZED':
    raise SystemExit('expected error.code=UNAUTHORIZED')
PY
echo "PASS: no-token request rejected with 401 UNAUTHORIZED"

AUTH_TOKEN="$(gcloud secrets versions access "$SECRET_VERSION"   --secret="$AUTH_SECRET"   --project="$PROJECT_ID")"

python3 - "$TMP_DIR/auth-request.json" "$TEMPLATE_ID" "$TEMPLATE_VERSION" <<'PY'
import json,sys
path, template_id, template_version = sys.argv[1], sys.argv[2], int(sys.argv[3])
with open(path, 'w', encoding='utf-8') as f:
    json.dump({
        "templateId": template_id,
        "templateVersion": template_version,
        "output": {"format": "pdf", "fileName": "cloud5-auth-smoke"},
        "data": {"invoiceNo": "CLOUD5-AUTH"},
    }, f, separators=(',', ':'))
PY

curl --fail-with-body --silent --show-error   -D "$TMP_DIR/auth.headers"   -o "$TMP_DIR/auth.pdf"   -X POST   -H "Authorization: Bearer $AUTH_TOKEN"   -H 'Content-Type: application/json'   "$BASE_URL/api/v1/documents/generate"   --data-binary @"$TMP_DIR/auth-request.json"
unset AUTH_TOKEN

MAGIC="$(od -An -t x1 -N5 "$TMP_DIR/auth.pdf" | tr -d ' \n')"
[[ "$MAGIC" == "255044462d" ]] || {
  echo "ERROR: generated output is not a PDF. First five bytes: $MAGIC" >&2
  exit 1
}

BYTES="$(wc -c <"$TMP_DIR/auth.pdf" | tr -d ' ')"
[[ "$BYTES" -gt 100 ]] || {
  echo "ERROR: generated PDF is unexpectedly small: $BYTES bytes" >&2
  exit 1
}

echo "PASS: authorized PDF generation ($BYTES bytes)"
echo "CLOUD-5.5 hosted auth smoke PASS"
