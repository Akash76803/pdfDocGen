#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"
AUTH_SECRET="${AUTH_SECRET:-pdf-doc-gen-api-auth-token}"
PORT="${PORT:-8080}"
TEMPLATE_ID="${TEMPLATE_ID:-cloud3-hosted-smoke-20260921}"
TEMPLATE_VERSION="${TEMPLATE_VERSION:-2}"
EXPECTED_LIMIT="${EXPECTED_LIMIT:-2}"
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
  echo "ERROR: could not resolve enabled auth secret version." >&2
  exit 1
}

AUTH_TOKEN="$(gcloud secrets versions access "$SECRET_VERSION"   --secret="$AUTH_SECRET"   --project="$PROJECT_ID")"

python3 - "$TMP_DIR/request.json" "$TEMPLATE_ID" "$TEMPLATE_VERSION" <<'PY'
import json,sys
path, template_id, template_version = sys.argv[1], sys.argv[2], int(sys.argv[3])
with open(path,'w',encoding='utf-8') as f:
    json.dump({
        "templateId":template_id,
        "templateVersion":template_version,
        "output":{"format":"pdf","responseMode":"base64"},
        "data":{"invoiceNo":"CLOUD7-RATE-LIMIT"}
    },f,separators=(',',':'))
PY

echo "Starting private Cloud Run proxy..."
gcloud run services proxy "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --port="$PORT" >"$TMP_DIR/proxy.log" 2>&1 &
PROXY_PID=$!

for attempt in {1..45}; do
  if curl --fail --silent "$BASE_URL/health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$PROXY_PID" >/dev/null 2>&1; then
    cat "$TMP_DIR/proxy.log" >&2
    echo "ERROR: Cloud Run proxy exited before health became ready." >&2
    exit 1
  fi
  sleep 1
done

curl --fail --silent "$BASE_URL/health" >/dev/null || {
  cat "$TMP_DIR/proxy.log" >&2
  echo "ERROR: health check failed." >&2
  exit 1
}
echo "PASS: health"

for i in 1 2 3; do
  curl --silent --show-error     -D "$TMP_DIR/headers-$i.txt"     -o "$TMP_DIR/body-$i.json"     -w '%{http_code}'     -X POST     -H "Authorization: Bearer $AUTH_TOKEN"     -H 'Content-Type: application/json'     "$BASE_URL/api/v1/documents/generate"     --data-binary @"$TMP_DIR/request.json" >"$TMP_DIR/status-$i.txt"
done
unset AUTH_TOKEN

python3 - "$TMP_DIR" "$EXPECTED_LIMIT" <<'PY'
import json,sys,pathlib,re
root=pathlib.Path(sys.argv[1])
expected=int(sys.argv[2])
statuses=[(root/f'status-{i}.txt').read_text().strip() for i in (1,2,3)]
if statuses[:expected] != ['200']*expected:
    raise SystemExit(f'FAIL: expected first {expected} requests to be 200, got {statuses}')
if statuses[expected] != '429':
    raise SystemExit(f'FAIL: expected request {expected+1} to be 429, got {statuses[expected]}')

headers=(root/f'headers-{expected+1}.txt').read_text(encoding='utf-8',errors='replace').lower()
retry=re.search(r'^retry-after:\s*(\d+)\s*$',headers,re.M)
remaining=re.search(r'^x-rate-limit-remaining:\s*(\d+)\s*$',headers,re.M)
if not retry or int(retry.group(1)) < 1:
    raise SystemExit('FAIL: Retry-After header missing or invalid')
if not remaining or remaining.group(1) != '0':
    raise SystemExit('FAIL: x-rate-limit-remaining must be 0 on rejected request')

body=json.loads((root/f'body-{expected+1}.json').read_text())
error=body.get('error',{})
if error.get('code') != 'RATE_LIMIT_EXCEEDED':
    raise SystemExit(f"FAIL: expected RATE_LIMIT_EXCEEDED, got {error.get('code')!r}")
retry_body=error.get('details',{}).get('retryAfterSeconds')
if not isinstance(retry_body,int) or retry_body < 1:
    raise SystemExit('FAIL: retryAfterSeconds missing or invalid in response body')

print(f'PASS: first {expected} authenticated requests allowed')
print(f'PASS: request {expected+1} rejected with 429 RATE_LIMIT_EXCEEDED')
print(f'PASS: Retry-After = {retry.group(1)}')
print('PASS: x-rate-limit-remaining = 0')
PY

echo "CLOUD-7.2 hosted quota verification PASS"
