#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"
AUTH_SECRET="${AUTH_SECRET:-pdf-doc-gen-api-auth-token}"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "ERROR: run this from the pdfDocGen repository." >&2
  exit 1
}

HEAD_SHA="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short=8 HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
DIRTY="$(git status --porcelain)"

[[ -z "$DIRTY" ]] || {
  echo "ERROR: working tree is not clean." >&2
  git status --short >&2
  exit 1
}

LATEST_READY="$(gcloud run services describe "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --format='value(status.latestReadyRevisionName)')"

LATEST_CREATED="$(gcloud run services describe "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --format='value(status.latestCreatedRevisionName)')"

IMAGE="$(gcloud run services describe "$SERVICE"   --project="$PROJECT_ID"   --region="$REGION"   --format='value(spec.template.spec.containers[0].image)')"

SERVICE_JSON="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format=json)"

SECRET_VERSION="$(python3 - "$SERVICE_JSON" <<'PY'
import json,sys
service=json.loads(sys.argv[1])
containers=service.get('spec',{}).get('template',{}).get('spec',{}).get('containers',[])
if not containers:
    raise SystemExit('')
for env in containers[0].get('env',[]):
    if env.get('name') != 'API_AUTH_STATIC_BEARER_TOKEN':
        continue
    ref=env.get('valueFrom',{}).get('secretKeyRef',{})
    print(ref.get('key') or ref.get('version') or '')
    break
PY
)"

[[ -n "$LATEST_READY" ]] || { echo "ERROR: latest ready revision could not be resolved." >&2; exit 1; }
[[ "$LATEST_READY" == "$LATEST_CREATED" ]] || {
  echo "ERROR: latest created revision is not ready." >&2
  echo "latestReady=$LATEST_READY latestCreated=$LATEST_CREATED" >&2
  exit 1
}
[[ -n "$IMAGE" ]] || { echo "ERROR: deployed image could not be resolved." >&2; exit 1; }
[[ "$SECRET_VERSION" =~ ^[0-9]+$ ]] || {
  echo "ERROR: auth secret is not pinned to a numeric version." >&2
  exit 1
}

echo "CLOUD-7.6 release gate"
echo "branch=$BRANCH"
echo "commit=$HEAD_SHA"
echo "shortCommit=$SHORT_SHA"
echo "latestReadyRevision=$LATEST_READY"
echo "image=$IMAGE"
echo "authSecret=$AUTH_SECRET"
echo "authSecretVersion=$SECRET_VERSION"
echo

bash scripts/cloud7-verify-runtime-guardrails.sh
bash scripts/cloud5-security-audit.sh
bash scripts/cloud5-hosted-auth-smoke.sh
bash scripts/cloud7-hosted-idempotency-smoke.sh

echo
echo "CLOUD-7.6 release gate PASS."
echo "Known-good revision: $LATEST_READY"
