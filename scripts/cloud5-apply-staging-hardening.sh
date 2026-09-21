#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"
RUNTIME_SA="${RUNTIME_SA:-pdf-doc-gen-api@${PROJECT_ID}.iam.gserviceaccount.com}"
BUCKET="${BUCKET:-gs://pdf-gen-509308-document-builder-assets}"
AUTH_SECRET="${AUTH_SECRET:-pdf-doc-gen-api-auth-token}"
REVISION_SUFFIX="${REVISION_SUFFIX:-cloud5-auth}"

echo "== CLOUD-5.5 staging hardening =="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE"
echo "Runtime SA: $RUNTIME_SA"
echo "Bucket: $BUCKET"
echo "Secret: $AUTH_SECRET"

gcloud services enable secretmanager.googleapis.com --project="$PROJECT_ID" >/dev/null

if ! gcloud secrets describe "$AUTH_SECRET" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud secrets create "$AUTH_SECRET"     --project="$PROJECT_ID"     --replication-policy=automatic >/dev/null
fi

if ! gcloud secrets versions list "$AUTH_SECRET"   --project="$PROJECT_ID"   --filter='state=ENABLED'   --format='value(name)' | grep -q .; then
  TOKEN="$(openssl rand -base64 48 | tr -d '\n')"
  printf '%s' "$TOKEN" | gcloud secrets versions add "$AUTH_SECRET"     --project="$PROJECT_ID"     --data-file=- >/dev/null
  unset TOKEN
fi

SECRET_VERSION="$(gcloud secrets versions list "$AUTH_SECRET"   --project="$PROJECT_ID"   --filter='state=ENABLED'   --sort-by='~createTime'   --limit=1   --format='value(name)')"

[[ "$SECRET_VERSION" =~ ^[0-9]+$ ]] || {
  echo "ERROR: Could not resolve a numeric enabled secret version." >&2
  exit 1
}

echo "Using pinned secret version: $SECRET_VERSION"

gcloud secrets add-iam-policy-binding "$AUTH_SECRET"   --project="$PROJECT_ID"   --member="serviceAccount:$RUNTIME_SA"   --role="roles/secretmanager.secretAccessor" >/dev/null

gcloud storage buckets add-iam-policy-binding "$BUCKET"   --member="serviceAccount:$RUNTIME_SA"   --role="roles/storage.objectUser" >/dev/null

if gcloud storage buckets get-iam-policy "$BUCKET" --format=json |   python3 -c 'import json,sys; p=json.load(sys.stdin); sa=sys.argv[1]; print(any(b.get("role")=="roles/storage.objectAdmin" and ("serviceAccount:"+sa) in b.get("members",[]) for b in p.get("bindings",[])))' "$RUNTIME_SA" | grep -qx True; then
  gcloud storage buckets remove-iam-policy-binding "$BUCKET"     --member="serviceAccount:$RUNTIME_SA"     --role="roles/storage.objectAdmin" >/dev/null
fi

PROJECT_ROLES="$(gcloud projects get-iam-policy "$PROJECT_ID"   --flatten='bindings[].members'   --filter="bindings.members:serviceAccount:$RUNTIME_SA"   --format='value(bindings.role)')"

echo "$PROJECT_ROLES" | grep -qx 'roles/datastore.user' || {
  echo "ERROR: runtime service account is missing roles/datastore.user." >&2
  exit 1
}

for role in roles/owner roles/editor roles/datastore.owner; do
  if echo "$PROJECT_ROLES" | grep -qx "$role"; then
    echo "ERROR: over-broad runtime role present: $role" >&2
    exit 1
  fi
done

RUN_POLICY="$(gcloud run services get-iam-policy "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --format=json)"

for principal in allUsers allAuthenticatedUsers; do
  if python3 - "$RUN_POLICY" "$principal" <<'PY' | grep -qx True
import json,sys
policy=json.loads(sys.argv[1] or '{}')
principal=sys.argv[2]
print(any(principal in b.get('members',[]) for b in policy.get('bindings',[])))
PY
  then
    while read -r role; do
      [[ -n "$role" ]] || continue
      gcloud run services remove-iam-policy-binding "$SERVICE"         --project="$PROJECT_ID"         --region="$REGION"         --member="$principal"         --role="$role" >/dev/null || true
    done < <(python3 - "$RUN_POLICY" "$principal" <<'PY'
import json,sys
policy=json.loads(sys.argv[1] or '{}')
principal=sys.argv[2]
for b in policy.get('bindings',[]):
    if principal in b.get('members',[]):
        print(b.get('role',''))
PY
)
  fi
done

gcloud run services update "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --service-account="$RUNTIME_SA"   --update-env-vars=API_AUTH_MODE=static-bearer   --set-secrets="API_AUTH_STATIC_BEARER_TOKEN=$AUTH_SECRET:$SECRET_VERSION"   --revision-suffix="$REVISION_SUFFIX"

echo
echo "Running security audit..."
PROJECT_ID="$PROJECT_ID" REGION="$REGION" SERVICE="$SERVICE" RUNTIME_SA="$RUNTIME_SA" BUCKET="$BUCKET" AUTH_SECRET="$AUTH_SECRET" bash scripts/cloud5-security-audit.sh

echo
echo "CLOUD-5.5 staging hardening applied successfully."
echo "Pinned secret version: $SECRET_VERSION"
echo "Next: run hosted auth smoke through gcloud run services proxy."
