#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"
AUTH_SECRET="${AUTH_SECRET:-pdf-doc-gen-api-auth-token}"

SERVICE_JSON="$(gcloud run services describe "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --format=json)"

OLD_SECRET_VERSION="$(python3 - "$SERVICE_JSON" "$AUTH_SECRET" <<'PY'
import json, sys
service=json.loads(sys.argv[1])
expected_secret=sys.argv[2]
containers=service.get('spec',{}).get('template',{}).get('spec',{}).get('containers',[])
if not containers:
    raise SystemExit('no Cloud Run container config found')
env={e.get('name'):e for e in containers[0].get('env',[])}
secret_ref=env.get('API_AUTH_STATIC_BEARER_TOKEN',{}).get('valueFrom',{}).get('secretKeyRef',{})
name=secret_ref.get('name','')
key=str(secret_ref.get('key',''))
if expected_secret not in name:
    raise SystemExit(f'unexpected auth secret reference: {name!r}')
if not key.isdigit():
    raise SystemExit(f'secret version is not numerically pinned: {key!r}')
print(key)
PY
)"

[[ "$OLD_SECRET_VERSION" =~ ^[0-9]+$ ]] || {
  echo "ERROR: could not resolve currently pinned numeric secret version." >&2
  exit 1
}

NEW_TOKEN="$(openssl rand -base64 48 | tr -d '\n')"
printf '%s' "$NEW_TOKEN" | gcloud secrets versions add "$AUTH_SECRET"   --project="$PROJECT_ID"   --data-file=- >/dev/null
unset NEW_TOKEN

NEW_SECRET_VERSION="$(gcloud secrets versions list "$AUTH_SECRET"   --project="$PROJECT_ID"   --filter='state=ENABLED'   --sort-by='~createTime'   --limit=1   --format='value(name)')"

[[ "$NEW_SECRET_VERSION" =~ ^[0-9]+$ ]] || {
  echo "ERROR: could not resolve new numeric secret version." >&2
  exit 1
}

[[ "$NEW_SECRET_VERSION" != "$OLD_SECRET_VERSION" ]] || {
  echo "ERROR: rotation did not create a new secret version." >&2
  exit 1
}

echo "Rotating auth secret: $OLD_SECRET_VERSION -> $NEW_SECRET_VERSION"

gcloud run services update "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --set-secrets="API_AUTH_STATIC_BEARER_TOKEN=$AUTH_SECRET:$NEW_SECRET_VERSION"   --revision-suffix="cloud5-rotate-$NEW_SECRET_VERSION"

echo
echo "Verifying new revision before disabling old secret version..."
bash scripts/cloud5-security-audit.sh
bash scripts/cloud5-hosted-auth-smoke.sh

echo
echo "Disabling old secret version: $OLD_SECRET_VERSION"
gcloud secrets versions disable "$OLD_SECRET_VERSION"   --secret="$AUTH_SECRET"   --project="$PROJECT_ID" >/dev/null

echo
echo "Final audit after rotation..."
bash scripts/cloud5-security-audit.sh

echo
echo "CLOUD-5.5 secret rotation verification PASS"
echo "Active secret version: $NEW_SECRET_VERSION"
echo "Disabled old version: $OLD_SECRET_VERSION"
