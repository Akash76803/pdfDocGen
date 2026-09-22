#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"

EXPECTED_MIN="${MIN_INSTANCES:-0}"
EXPECTED_MAX="${MAX_INSTANCES:-10}"
EXPECTED_CONCURRENCY="${CONCURRENCY:-4}"
EXPECTED_TIMEOUT="${CLOUD_RUN_TIMEOUT:-300}"
EXPECTED_CPU="${CPU:-1}"
EXPECTED_MEMORY="${MEMORY:-1Gi}"

SERVICE_JSON="$(gcloud run services describe "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --format=json)"

python3 - "$SERVICE_JSON" "$EXPECTED_MIN" "$EXPECTED_MAX" "$EXPECTED_CONCURRENCY" "$EXPECTED_TIMEOUT" "$EXPECTED_CPU" "$EXPECTED_MEMORY" <<'PY'
import json, sys
service=json.loads(sys.argv[1])
expected_min,expected_max,expected_concurrency,expected_timeout,expected_cpu,expected_memory=sys.argv[2:]
template=service.get('spec',{}).get('template',{})
metadata=template.get('metadata',{})
annotations=metadata.get('annotations',{})
spec=template.get('spec',{})
containers=spec.get('containers',[])
if not containers:
    raise SystemExit('FAIL: no Cloud Run container found')
container=containers[0]
resources=container.get('resources',{}).get('limits',{})
actual_min=annotations.get('autoscaling.knative.dev/minScale','0')
actual_max=annotations.get('autoscaling.knative.dev/maxScale','')
actual_concurrency=str(spec.get('containerConcurrency',''))
actual_timeout=str(spec.get('timeoutSeconds',''))
actual_cpu=str(resources.get('cpu',''))
actual_memory=str(resources.get('memory',''))
checks=[
 ('min instances',actual_min,expected_min),
 ('max instances',actual_max,expected_max),
 ('concurrency',actual_concurrency,expected_concurrency),
 ('timeout',actual_timeout,expected_timeout),
 ('cpu',actual_cpu,expected_cpu),
 ('memory',actual_memory,expected_memory),
]
failed=False
for name,actual,expected in checks:
    if actual != expected:
        print(f'FAIL: {name}: expected {expected!r}, got {actual!r}')
        failed=True
    else:
        print(f'PASS: {name} = {actual}')
if failed:
    raise SystemExit(1)

env={e.get('name'):e.get('value') for e in container.get('env',[]) if 'value' in e}
required={
 'API_GENERATION_TIMEOUT_MS':'240000',
 'API_ABSOLUTE_GENERATION_TIMEOUT_MS':'295000',
 'API_MAX_BATCH_DOCUMENTS':'100',
 'API_ABSOLUTE_MAX_BATCH_DOCUMENTS':'500',
 'API_MAX_BODY_MB':'20',
 'API_ABSOLUTE_MAX_BODY_MB':'50',
 'API_RATE_LIMIT_PER_MINUTE':'120',
 'API_ABSOLUTE_RATE_LIMIT_PER_MINUTE':'1000',
}
for key,expected in required.items():
    actual=env.get(key)
    if actual != expected:
        raise SystemExit(f'FAIL: {key}: expected {expected!r}, got {actual!r}')
    print(f'PASS: {key} = {actual}')
print('CLOUD-7.1 runtime guardrail verification PASS')
PY
