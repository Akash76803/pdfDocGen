#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[1/4] health"
curl --fail --silent --show-error "${BASE_URL}/health" > "$TMP_DIR/health.json"
node -e "const x=require('$TMP_DIR/health.json'); if(x.status!=='ok'||x.service!=='document-builder-api') process.exit(1)"

echo "[2/4] publish ephemeral smoke template"
cat > "$TMP_DIR/template.json" <<'JSON'
{
  "id": "cloud1-smoke",
  "name": "Cloud 1 Smoke",
  "version": 1,
  "payload": {
    "name": "Cloud 1 Smoke",
    "pages": [
      {
        "id": "page-1",
        "settings": {
          "preset": "A4",
          "orientation": "Portrait",
          "marginsMm": { "top": 10, "right": 10, "bottom": 10, "left": 10 }
        },
        "elements": [
          {
            "id": "title",
            "type": "text",
            "region": "body",
            "text": "Invoice {{invoiceNo}}",
            "x": 40,
            "y": 40,
            "width": 300,
            "height": 40,
            "fontSize": 16,
            "textAlign": "left",
            "color": "#111111",
            "fill": "transparent"
          }
        ]
      }
    ]
  }
}
JSON

curl --fail --silent --show-error   -X PUT   -H "content-type: application/json"   --data-binary @"$TMP_DIR/template.json"   "${BASE_URL}/api/v1/templates/cloud1-smoke" > "$TMP_DIR/template-response.json"

node -e "const x=require('$TMP_DIR/template-response.json'); if(x.status!=='saved'||x.templateId!=='cloud1-smoke') process.exit(1)"

echo "[3/4] single PDF"
curl --fail --silent --show-error   -D "$TMP_DIR/single.headers"   -H "content-type: application/json"   --data '{"templateId":"cloud1-smoke","output":{"format":"pdf","fileName":"cloud-single"},"data":{"invoiceNo":"CLOUD-1"}}'   "${BASE_URL}/api/v1/documents/generate"   -o "$TMP_DIR/single.pdf"

node -e "const fs=require('fs');const b=fs.readFileSync('$TMP_DIR/single.pdf');if(b.subarray(0,5).toString()!=='%PDF-')process.exit(1)"

echo "[4/4] combined batch PDF"
curl --fail --silent --show-error   -D "$TMP_DIR/batch.headers"   -H "content-type: application/json"   --data '{"templateId":"cloud1-smoke","output":{"format":"pdf","outputMode":"combined","fileName":"cloud-batch"},"documents":[{"id":"ONE","data":{"invoiceNo":"CLOUD-1-A"}},{"id":"TWO","data":{"invoiceNo":"CLOUD-1-B"}}]}'   "${BASE_URL}/api/v1/documents/generate/batch"   -o "$TMP_DIR/batch.pdf"

node -e "const fs=require('fs');const b=fs.readFileSync('$TMP_DIR/batch.pdf');if(b.subarray(0,5).toString()!=='%PDF-')process.exit(1)"
grep -qi '^x-document-page-count: 2' "$TMP_DIR/batch.headers"

echo "CLOUD-1 container smoke PASS"
