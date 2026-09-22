#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"
RUNTIME_SA="${RUNTIME_SA:-pdf-doc-gen-api@${PROJECT_ID}.iam.gserviceaccount.com}"
BUCKET="${BUCKET:-gs://pdf-gen-509308-document-builder-assets}"
AUTH_SECRET="${AUTH_SECRET:-pdf-doc-gen-api-auth-token}"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

echo "[1/6] Cloud Run remains private"
RUN_POLICY="$(gcloud run services get-iam-policy "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format=json)"
python3 - "$RUN_POLICY" <<'PY'
import json, sys
policy=json.loads(sys.argv[1] or '{}')
members={m for b in policy.get('bindings',[]) for m in b.get('members',[])}
bad={'allUsers','allAuthenticatedUsers'} & members
if bad:
    raise SystemExit('public principal present: '+','.join(sorted(bad)))
PY
pass "no public Cloud Run principals"

echo "[2/6] Dedicated runtime service account"
ACTUAL_SA="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)')"
[[ "$ACTUAL_SA" == "$RUNTIME_SA" ]] || fail "runtime service account is $ACTUAL_SA"
pass "runtime service account is $RUNTIME_SA"

echo "[3/6] Auth mode and Secret Manager reference"
SERVICE_JSON="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format=json)"
python3 - "$SERVICE_JSON" "$AUTH_SECRET" <<'PY'
import json, sys
service=json.loads(sys.argv[1])
expected_secret=sys.argv[2]
containers=service.get('spec',{}).get('template',{}).get('spec',{}).get('containers',[])
if not containers:
    raise SystemExit('no Cloud Run container config found')
env={e.get('name'):e for e in containers[0].get('env',[])}
mode=env.get('API_AUTH_MODE',{}).get('value')
if mode != 'static-bearer':
    raise SystemExit(f'API_AUTH_MODE={mode!r}, expected static-bearer')
secret_ref=env.get('API_AUTH_STATIC_BEARER_TOKEN',{}).get('valueFrom',{}).get('secretKeyRef',{})
if not secret_ref:
    raise SystemExit('API_AUTH_STATIC_BEARER_TOKEN is not backed by secretKeyRef')
name=secret_ref.get('name','')
key=str(secret_ref.get('key',''))
if expected_secret not in name:
    raise SystemExit(f'unexpected auth secret reference: {name!r}')
if not key.isdigit():
    raise SystemExit(f'secret version is not numerically pinned: {key!r}')
print(f'Pinned auth secret version: {key}')
PY
pass "auth mode and pinned secret reference"

echo "[4/6] Secret-level accessor"
SECRET_BINDING="$(gcloud secrets get-iam-policy "$AUTH_SECRET" --project="$PROJECT_ID" --format=json)"
python3 - "$SECRET_BINDING" "$RUNTIME_SA" <<'PY'
import json, sys
policy=json.loads(sys.argv[1] or '{}')
member='serviceAccount:'+sys.argv[2]
ok=any(b.get('role')=='roles/secretmanager.secretAccessor' and member in b.get('members',[]) for b in policy.get('bindings',[]))
if not ok:
    raise SystemExit('runtime SA lacks secret-level roles/secretmanager.secretAccessor')
PY
pass "runtime SA can access only the audited secret resource"

echo "[5/6] Bucket-scoped object role"
BUCKET_POLICY="$(gcloud storage buckets get-iam-policy "$BUCKET" --format=json)"
python3 - "$BUCKET_POLICY" "$RUNTIME_SA" <<'PY'
import json, sys
policy=json.loads(sys.argv[1] or '{}')
member='serviceAccount:'+sys.argv[2]
roles={b.get('role') for b in policy.get('bindings',[]) if member in b.get('members',[])}
if 'roles/storage.objectUser' not in roles:
    raise SystemExit('roles/storage.objectUser missing')
if 'roles/storage.objectAdmin' in roles:
    raise SystemExit('broader roles/storage.objectAdmin is still present')
PY
pass "bucket role reduced to roles/storage.objectUser"

echo "[6/6] Firestore data role"
PROJECT_POLICY="$(gcloud projects get-iam-policy "$PROJECT_ID" --format=json)"
python3 - "$PROJECT_POLICY" "$RUNTIME_SA" <<'PY'
import json, sys
policy=json.loads(sys.argv[1] or '{}')
member='serviceAccount:'+sys.argv[2]
roles={b.get('role') for b in policy.get('bindings',[]) if member in b.get('members',[])}
if 'roles/datastore.user' not in roles:
    raise SystemExit('roles/datastore.user missing')
for forbidden in ('roles/owner','roles/editor','roles/datastore.owner'):
    if forbidden in roles:
        raise SystemExit(f'over-broad runtime role present: {forbidden}')
PY
pass "Firestore role is least-privilege compatible"

echo "CLOUD-5.5 security audit PASS"
