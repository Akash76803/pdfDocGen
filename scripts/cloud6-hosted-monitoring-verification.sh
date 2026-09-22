#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"
FRESHNESS="${FRESHNESS:-30m}"

echo "CLOUD-6 hosted monitoring verification"
echo "Project: ${PROJECT_ID}"
echo "Service: ${SERVICE}"
echo

gcloud logging read \
  "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE}\" AND jsonPayload.event=\"api_metric\"" \
  --project="${PROJECT_ID}" \
  --limit=50 \
  --freshness="${FRESHNESS}" \
  --format=json > /tmp/cloud6-metrics.json

python3 - <<'PY'
import json
from pathlib import Path
p=Path('/tmp/cloud6-metrics.json')
rows=json.loads(p.read_text() or '[]')
if not rows:
    raise SystemExit('FAIL: no api_metric log entries found in requested freshness window')
metrics=[]
for row in rows:
    payload=row.get('jsonPayload') or {}
    metric=payload.get('metric')
    if metric:
        metrics.append(metric)
required={'api.request.count','api.request.duration_ms'}
missing=required-set(metrics)
if missing:
    raise SystemExit('FAIL: missing required metrics: '+', '.join(sorted(missing)))
print('PASS: api_metric log entries found')
print('Observed metrics:')
for metric in sorted(set(metrics)):
    print('  -',metric)
serialized=json.dumps(rows)
for forbidden in ('authorization','Bearer ','password','secret-value'):
    if forbidden in serialized:
        raise SystemExit(f'FAIL: forbidden sensitive marker found: {forbidden}')
print('PASS: no obvious sensitive markers found')
PY

echo
echo "CLOUD-6 hosted monitoring verification PASS"
