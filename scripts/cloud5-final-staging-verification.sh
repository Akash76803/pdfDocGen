#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"
AUTH_SECRET="${AUTH_SECRET:-pdf-doc-gen-api-auth-token}"

echo "CLOUD-5.7 final staging verification"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE"
echo

SERVICE_JSON="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format=json)"

python3 - "$SERVICE_JSON" "$AUTH_SECRET" <<'PY'
import json, sys
service=json.loads(sys.argv[1])
expected_secret=sys.argv[2]
template=service.get('spec',{}).get('template',{})
spec=template.get('spec',{})
containers=spec.get('containers',[])
if not containers:
    raise SystemExit('ERROR: no Cloud Run container config found')
container=containers[0]
env={e.get('name'):e for e in container.get('env',[])}
secret_ref=env.get('API_AUTH_STATIC_BEARER_TOKEN',{}).get('valueFrom',{}).get('secretKeyRef',{})
secret_name=secret_ref.get('name','')
secret_version=str(secret_ref.get('key',''))
if expected_secret not in secret_name:
    raise SystemExit(f'ERROR: unexpected auth secret reference: {secret_name!r}')
if not secret_version.isdigit():
    raise SystemExit(f'ERROR: auth secret version is not numerically pinned: {secret_version!r}')
status=service.get('status',{})
print('Current staging evidence:')
print('  latestReadyRevision:', status.get('latestReadyRevisionName',''))
print('  latestCreatedRevision:', status.get('latestCreatedRevisionName',''))
print('  image:', container.get('image',''))
print('  runtimeServiceAccount:', spec.get('serviceAccountName',''))
print('  authMode:', env.get('API_AUTH_MODE',{}).get('value',''))
print('  authSecretName:', secret_name)
print('  authSecretVersion:', secret_version)
print('  serviceUrl:', status.get('url',''))
PY

echo
echo "[1/2] Security/IAM audit"
bash scripts/cloud5-security-audit.sh

echo
echo "[2/2] Hosted auth smoke"
bash scripts/cloud5-hosted-auth-smoke.sh

echo
echo "CLOUD-5.7 final staging verification PASS"
echo "No secret payload was printed."
