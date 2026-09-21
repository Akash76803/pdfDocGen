# CLOUD-5.5 — Cloud IAM & Secrets Hardening Runbook

## Objective

Harden the private pdfDocGen staging service so hosted runtime authentication cannot start disabled, secrets are sourced from Google Secret Manager, and the Cloud Run service identity has only the permissions required for Firestore, Cloud Storage, and the selected secret.

Target environment:

- Project: `pdf-gen-509308`
- Region: `us-central1`
- Service: `pdf-doc-gen-api-staging`
- Runtime service account: `pdf-doc-gen-api@pdf-gen-509308.iam.gserviceaccount.com`
- Bucket: `gs://pdf-gen-509308-document-builder-assets`
- Firestore: `(default)`
- Secret name: `pdf-doc-gen-api-auth-token`

## Security policy

1. Cloud Run remains private: no `allUsers` or `allAuthenticatedUsers` invoker grant.
2. Cloud runtime must not start with `API_AUTH_MODE=disabled`.
3. Hosted transitional auth mode is `static-bearer`, with its value sourced from Secret Manager.
4. Never commit or paste the secret value into source code, docs, GitHub Actions, tracker, or normal environment-variable commands.
5. Pin the Secret Manager version when exposed as an environment variable.
6. Use the dedicated Cloud Run service identity; do not set `GOOGLE_APPLICATION_CREDENTIALS`.
7. Grant Secret Manager accessor only on the single auth secret.
8. Keep Firestore access at `roles/datastore.user`.
9. Prefer bucket-scoped `roles/storage.objectUser` over broader object-admin access for runtime.

## 1. Enable Secret Manager

```bash
gcloud services enable secretmanager.googleapis.com \
  --project=pdf-gen-509308
```

## 2. Create the auth secret

```bash
gcloud secrets describe pdf-doc-gen-api-auth-token \
  --project=pdf-gen-509308 >/dev/null 2>&1 || \
gcloud secrets create pdf-doc-gen-api-auth-token \
  --project=pdf-gen-509308 \
  --replication-policy=automatic
```

Generate a strong value without saving it to repository files:

```bash
TOKEN="$(openssl rand -base64 48 | tr -d '\n')"
printf '%s' "$TOKEN" | gcloud secrets versions add pdf-doc-gen-api-auth-token \
  --project=pdf-gen-509308 \
  --data-file=-
unset TOKEN

SECRET_VERSION="$(gcloud secrets versions list pdf-doc-gen-api-auth-token \
  --project=pdf-gen-509308 \
  --filter='state=ENABLED' \
  --sort-by='~createTime' \
  --limit=1 \
  --format='value(name)')"

echo "Secret version: $SECRET_VERSION"
```

Only the numeric version is safe to print; never print the secret payload.

## 3. Grant secret access only to the runtime identity

```bash
gcloud secrets add-iam-policy-binding pdf-doc-gen-api-auth-token \
  --project=pdf-gen-509308 \
  --member="serviceAccount:pdf-doc-gen-api@pdf-gen-509308.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets get-iam-policy pdf-doc-gen-api-auth-token \
  --project=pdf-gen-509308 \
  --format="yaml(bindings)"
```

Do not grant project-wide Secret Manager accessor unless a separately audited requirement proves it necessary.

## 4. Tighten Cloud Storage role

Inspect current bucket policy:

```bash
gcloud storage buckets get-iam-policy \
  gs://pdf-gen-509308-document-builder-assets \
  --format="yaml(bindings)"
```

Grant bucket-scoped Object User:

```bash
gcloud storage buckets add-iam-policy-binding \
  gs://pdf-gen-509308-document-builder-assets \
  --member="serviceAccount:pdf-doc-gen-api@pdf-gen-509308.iam.gserviceaccount.com" \
  --role="roles/storage.objectUser"
```

After verification, remove the broader Object Admin binding:

```bash
gcloud storage buckets remove-iam-policy-binding \
  gs://pdf-gen-509308-document-builder-assets \
  --member="serviceAccount:pdf-doc-gen-api@pdf-gen-509308.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

## 5. Verify Firestore least privilege

```bash
gcloud projects get-iam-policy pdf-gen-509308 \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:pdf-doc-gen-api@pdf-gen-509308.iam.gserviceaccount.com" \
  --format="table(bindings.role,bindings.members)"
```

Expected application data role:

```text
roles/datastore.user
```

Do not add Owner, Editor, Datastore Owner, or broad project roles to the runtime service account.

## 6. Verify Cloud Run remains private

```bash
gcloud run services get-iam-policy pdf-doc-gen-api-staging \
  --project=pdf-gen-509308 \
  --region=us-central1 \
  --format="yaml(bindings)"
```

The policy must not contain `allUsers` or `allAuthenticatedUsers`.

## 7. Wire the pinned Secret Manager version into Cloud Run

The application now refuses to start on Cloud Run when `API_AUTH_MODE=disabled`.

```bash
gcloud run services update pdf-doc-gen-api-staging \
  --project=pdf-gen-509308 \
  --region=us-central1 \
  --service-account=pdf-doc-gen-api@pdf-gen-509308.iam.gserviceaccount.com \
  --no-allow-unauthenticated \
  --update-env-vars=API_AUTH_MODE=static-bearer \
  --set-secrets="API_AUTH_STATIC_BEARER_TOKEN=pdf-doc-gen-api-auth-token:$SECRET_VERSION" \
  --revision-suffix=cloud5-auth
```

The command contains only a Secret Manager reference, never the secret value.

## 8. Verify deployed config without exposing payloads

```bash
gcloud run services describe pdf-doc-gen-api-staging \
  --project=pdf-gen-509308 \
  --region=us-central1 \
  --format="yaml(spec.template.spec.serviceAccountName,spec.template.spec.containers[0].env,status.latestReadyRevisionName,status.url)"
```

Expected:
- dedicated runtime service account;
- `API_AUTH_MODE=static-bearer`;
- `API_AUTH_STATIC_BEARER_TOKEN` represented by a Secret Manager reference;
- latest revision ready.

## 9. Hosted auth smoke through the private proxy

Terminal 1:

```bash
gcloud run services proxy pdf-doc-gen-api-staging \
  --project=pdf-gen-509308 \
  --region=us-central1 \
  --port=8080
```

Terminal 2:

```bash
AUTH_TOKEN="$(gcloud secrets versions access "$SECRET_VERSION" \
  --secret=pdf-doc-gen-api-auth-token \
  --project=pdf-gen-509308)"
```

Health:

```bash
curl --fail-with-body --silent --show-error \
  http://127.0.0.1:8080/health | python3 -m json.tool
```

Protected route without app token must return 401:

```bash
curl --silent --show-error -o /tmp/cloud5-no-token.json -w '%{http_code}\n' \
  -X POST \
  -H 'Content-Type: application/json' \
  http://127.0.0.1:8080/api/v1/documents/generate \
  --data '{"templateId":"cloud3-hosted-smoke-20260921","templateVersion":2,"output":{"format":"pdf"},"data":{"invoiceNo":"CLOUD5-NO-TOKEN"}}'

cat /tmp/cloud5-no-token.json | python3 -m json.tool
```

Authorized generation:

```bash
curl --fail-with-body --silent --show-error \
  -D /tmp/cloud5-auth.headers \
  -o /tmp/cloud5-auth.pdf \
  -X POST \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H 'Content-Type: application/json' \
  http://127.0.0.1:8080/api/v1/documents/generate \
  --data '{"templateId":"cloud3-hosted-smoke-20260921","templateVersion":2,"output":{"format":"pdf","fileName":"cloud5-auth-smoke"},"data":{"invoiceNo":"CLOUD5-AUTH"}}'

file /tmp/cloud5-auth.pdf
wc -c /tmp/cloud5-auth.pdf
od -An -t x1 -N5 /tmp/cloud5-auth.pdf
unset AUTH_TOKEN
```

Expected first five bytes:

```text
25 50 44 46 2d
```

## 10. Secret rotation

```bash
NEW_TOKEN="$(openssl rand -base64 48 | tr -d '\n')"
printf '%s' "$NEW_TOKEN" | gcloud secrets versions add pdf-doc-gen-api-auth-token \
  --project=pdf-gen-509308 \
  --data-file=-
unset NEW_TOKEN

NEW_SECRET_VERSION="$(gcloud secrets versions list pdf-doc-gen-api-auth-token \
  --project=pdf-gen-509308 \
  --filter='state=ENABLED' \
  --sort-by='~createTime' \
  --limit=1 \
  --format='value(name)')"

gcloud run services update pdf-doc-gen-api-staging \
  --project=pdf-gen-509308 \
  --region=us-central1 \
  --set-secrets="API_AUTH_STATIC_BEARER_TOKEN=pdf-doc-gen-api-auth-token:$NEW_SECRET_VERSION" \
  --revision-suffix=cloud5-rotate
```

After the new revision passes smokes:

```bash
gcloud secrets versions disable "$SECRET_VERSION" \
  --secret=pdf-doc-gen-api-auth-token \
  --project=pdf-gen-509308
```

Never disable the active version before the replacement revision is healthy.

## 11. Runtime diagnostics

Startup diagnostics may emit runtime, repository mode, auth mode, and limits. They must never emit the bearer token or any secret payload.

## 12. Acceptance criteria

CLOUD-5.5 is complete when:
- Cloud Run rejects startup with app auth disabled;
- service remains private;
- dedicated runtime SA is attached;
- Firestore remains `roles/datastore.user`;
- bucket access is bucket-scoped and reduced from objectAdmin to objectUser;
- Secret Manager accessor is secret-scoped to the auth secret;
- no key file / `GOOGLE_APPLICATION_CREDENTIALS` is used;
- secret is stored in Secret Manager and pinned by numeric version;
- no secret value appears in Git/logs/tracker/deploy commands;
- hosted 401 no-token smoke passes;
- hosted authorized PDF smoke passes;
- rotation creates a healthy new revision;
- local gates and PR CI pass.

## Next

Continue with CLOUD-5.6 Security QA.
