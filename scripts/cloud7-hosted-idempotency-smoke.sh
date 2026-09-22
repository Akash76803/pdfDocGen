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
KEY="cloud7-idem-$(date +%s)-$$"

cleanup() {
  if [[ -n "$PROXY_PID" ]] && kill -0 "$PROXY_PID" >/dev/null 2>&1; then
    kill "$PROXY_PID" >/dev/null 2>&1 || true
    wait "$PROXY_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

SECRET_VERSION="$(gcloud secrets versions list "$AUTH_SECRET"   --project="$PROJECT_ID"   --filter='state=ENABLED'   --sort-by='~createTime'   --limit=1   --format='value(name)')"
[[ "$SECRET_VERSION" =~ ^[0-9]+$ ]] || { echo "ERROR: could not resolve auth secret version" >&2; exit 1; }
AUTH_TOKEN="$(gcloud secrets versions access "$SECRET_VERSION" --secret="$AUTH_SECRET" --project="$PROJECT_ID")"

echo "Starting private Cloud Run proxy..."
gcloud run services proxy "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --port="$PORT" >"$TMP_DIR/proxy.log" 2>&1 &
PROXY_PID=$!

for attempt in {1..45}; do
  if curl --fail --silent "$BASE_URL/health" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$PROXY_PID" >/dev/null 2>&1; then cat "$TMP_DIR/proxy.log" >&2; exit 1; fi
  sleep 1
done
curl --fail --silent "$BASE_URL/health" >/dev/null
echo "PASS: health"

python3 - "$TMP_DIR/request.json" "$TMP_DIR/conflict.json" "$TEMPLATE_ID" "$TEMPLATE_VERSION" <<'PY'
import json,sys
request_path, conflict_path, template_id, template_version = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
base={
  "templateId":template_id,
  "templateVersion":template_version,
  "output":{"format":"pdf","responseMode":"base64","fileName":"cloud7-idempotency-smoke"},
  "data":{"invoiceNo":"CLOUD7-IDEMPOTENCY"}
}
with open(request_path,'w',encoding='utf-8') as f: json.dump(base,f,separators=(',',':'))
base["data"]["invoiceNo"]="CLOUD7-IDEMPOTENCY-CONFLICT"
with open(conflict_path,'w',encoding='utf-8') as f: json.dump(base,f,separators=(',',':'))
PY

request() {
  local body="$1" headers="$2" output="$3"
  curl --silent --show-error     -D "$headers"     -o "$output"     -w '%{http_code}'     -X POST     -H "Authorization: Bearer $AUTH_TOKEN"     -H 'Content-Type: application/json'     -H "Idempotency-Key: $KEY"     "$BASE_URL/api/v1/documents/generate"     --data-binary @"$body"
}

FIRST_STATUS="$(request "$TMP_DIR/request.json" "$TMP_DIR/first.headers" "$TMP_DIR/first.json")"
[[ "$FIRST_STATUS" == "200" ]] || { echo "ERROR: first request expected 200, got $FIRST_STATUS" >&2; cat "$TMP_DIR/first.json" >&2; exit 1; }

SECOND_STATUS="$(request "$TMP_DIR/request.json" "$TMP_DIR/second.headers" "$TMP_DIR/second.json")"
[[ "$SECOND_STATUS" == "200" ]] || { echo "ERROR: replay expected 200, got $SECOND_STATUS" >&2; cat "$TMP_DIR/second.json" >&2; exit 1; }

grep -qi '^x-idempotency-replayed: *true' "$TMP_DIR/second.headers" || {
  echo "ERROR: replay response missing x-idempotency-replayed: true" >&2
  cat "$TMP_DIR/second.headers" >&2
  exit 1
}

python3 - "$TMP_DIR/first.json" "$TMP_DIR/second.json" <<'PY'
import json,sys
with open(sys.argv[1],encoding='utf-8') as f: a=json.load(f)
with open(sys.argv[2],encoding='utf-8') as f: b=json.load(f)
if a.get('jobId') != b.get('jobId'):
    raise SystemExit('replayed jobId does not match original')
if a.get('file',{}).get('content') != b.get('file',{}).get('content'):
    raise SystemExit('replayed file content does not match original')
PY

echo "PASS: same key + same payload replayed without regeneration"

CONFLICT_STATUS="$(request "$TMP_DIR/conflict.json" "$TMP_DIR/conflict.headers" "$TMP_DIR/conflict-response.json")"
[[ "$CONFLICT_STATUS" == "409" ]] || { echo "ERROR: conflict expected 409, got $CONFLICT_STATUS" >&2; cat "$TMP_DIR/conflict-response.json" >&2; exit 1; }
python3 - "$TMP_DIR/conflict-response.json" <<'PY'
import json,sys
with open(sys.argv[1],encoding='utf-8') as f: body=json.load(f)
if body.get('error',{}).get('code') != 'IDEMPOTENCY_KEY_REUSED':
    raise SystemExit('expected IDEMPOTENCY_KEY_REUSED')
PY
echo "PASS: same key + different payload rejected with 409 IDEMPOTENCY_KEY_REUSED"

unset AUTH_TOKEN
echo "CLOUD-7.3 hosted idempotency verification PASS"
