# CLOUD-3 — GCP Persistent Storage Setup and Verification Runbook

This document records the actual infrastructure, deployment, persistence, restart, PDF-generation, and merge process completed for the standalone repository **`Akash76803/pdfDocGen`**.

> This runbook does not apply to the older `Akash76803/docGen` repository.

## Final result

- Project: `pdf-gen-509308`
- Region: `us-central1`
- Cloud Run service: `pdf-doc-gen-api-staging`
- Firestore database: `(default)`, Native mode
- Cloud Storage bucket: `pdf-gen-509308-document-builder-assets`
- Runtime service account: `pdf-doc-gen-api@pdf-gen-509308.iam.gserviceaccount.com`
- CLOUD-3 PR: [#7](https://github.com/Akash76803/pdfDocGen/pull/7)
- Final main baseline: `c2fce635d4678ef9f4e2ac41e3fe371559de5ec7` (`c2fce63`)
- Status: **100% Complete — MERGED / POST-MERGE CI PASS**

## What CLOUD-3 proves

The hosted API can persist templates and image assets outside the Cloud Run container, survive a new server revision, reload an explicit template version, hydrate its stored assets, and generate a valid PDF without duplicating renderer logic.

The data flow is:

```text
Desktop publisher
  -> private Cloud Run API
  -> Firestore current/version metadata
  -> Cloud Storage immutable template JSON and content-addressed assets
  -> shared generation engine
  -> PDF response
```

The local/offline filesystem and IndexedDB workflows remain available.

## 1. Select and verify the Google Cloud project

```bash
gcloud config set project pdf-gen-509308
gcloud config get-value project
gcloud auth list
gcloud config get-value account
```

Expected project:

```text
pdf-gen-509308
```

Billing must be enabled:

```bash
gcloud billing projects describe pdf-gen-509308 \
  --format="table(projectId,billingEnabled,billingAccountName)"
```

Expected: `BILLING_ENABLED=True`.

## 2. Enable required Google APIs

```bash
gcloud services enable \
  firestore.googleapis.com \
  storage.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com
```

Verify:

```bash
gcloud services list --enabled \
  --filter="config.name:(firestore.googleapis.com storage.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com iam.googleapis.com)" \
  --format="value(config.name)"
```

## 3. Create Firestore

```bash
gcloud firestore databases create \
  --database="(default)" \
  --location=us-central1 \
  --edition=standard \
  --type=firestore-native
```

Verify:

```bash
gcloud firestore databases describe \
  --database="(default)" \
  --format="table(name,type,locationId,edition)"
```

The completed setup used Firestore Native mode in `us-central1`.

## 4. Create and secure the Cloud Storage bucket

```bash
gcloud storage buckets create \
  gs://pdf-gen-509308-document-builder-assets \
  --project=pdf-gen-509308 \
  --location=us-central1 \
  --default-storage-class=STANDARD \
  --uniform-bucket-level-access

gcloud storage buckets update \
  gs://pdf-gen-509308-document-builder-assets \
  --public-access-prevention
```

The bucket uses uniform bucket-level access and public access prevention.

## 5. Create the Cloud Run runtime identity

```bash
gcloud iam service-accounts create pdf-doc-gen-api \
  --project=pdf-gen-509308 \
  --display-name="PDF Doc Gen Cloud Run API" \
  --description="Runtime identity for the hosted PDF Document API"
```

Grant Firestore document access:

```bash
gcloud projects add-iam-policy-binding pdf-gen-509308 \
  --member="serviceAccount:pdf-doc-gen-api@pdf-gen-509308.iam.gserviceaccount.com" \
  --role="roles/datastore.user"
```

Grant object access only on the application bucket:

```bash
gcloud storage buckets add-iam-policy-binding \
  gs://pdf-gen-509308-document-builder-assets \
  --member="serviceAccount:pdf-doc-gen-api@pdf-gen-509308.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

Verify the bucket policy:

```bash
gcloud storage buckets get-iam-policy \
  gs://pdf-gen-509308-document-builder-assets \
  --format="yaml(bindings)"
```

No service-account key file is required or committed. Cloud Run uses Application Default Credentials through its runtime identity.

## 6. Deploy the private staging API

The verified source commit before merge was `93ad8fb73509cc0d63bc8c95581be183d314f921`.

```bash
gcloud run deploy pdf-doc-gen-api-staging \
  --source=. \
  --project=pdf-gen-509308 \
  --region=us-central1 \
  --platform=managed \
  --service-account=pdf-doc-gen-api@pdf-gen-509308.iam.gserviceaccount.com \
  --no-allow-unauthenticated \
  --set-env-vars='GOOGLE_CLOUD_PROJECT=pdf-gen-509308,API_TEMPLATE_REPOSITORY_MODE=cloud,API_GCP_TEMPLATE_BUCKET=pdf-gen-509308-document-builder-assets,API_GCP_FIRESTORE_DATABASE=(default),API_GCP_TEMPLATE_PREFIX=document-builder/templates,API_GCP_ASSET_PREFIX=document-builder/assets,API_MAX_BODY_MB=20,API_ABSOLUTE_MAX_BODY_MB=50' \
  --cpu=1 \
  --memory=1Gi \
  --concurrency=20 \
  --timeout=300 \
  --min-instances=0 \
  --max-instances=3
```

Security rule: keep the service private until CLOUD-5 authentication is implemented.

Resolve the canonical service URL instead of hard-coding it:

```bash
SERVICE_URL="$(gcloud run services describe \
  pdf-doc-gen-api-staging \
  --region=us-central1 \
  --project=pdf-gen-509308 \
  --format='value(status.url)')"
```

## 7. Verify API health

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  "$SERVICE_URL/health"
```

Verified response:

```json
{
  "status": "ok",
  "service": "document-builder-api",
  "phase": "DB-6B",
  "limits": {
    "requestBodyMb": 20,
    "absoluteMaxMb": 50
  }
}
```

## 8. Publish template version 1

The smoke template ID was:

```text
cloud3-hosted-smoke-20260921
```

Publication endpoint:

```text
PUT /api/v1/templates/{templateId}/publish
```

The version 1 request used:

- `version: 1`
- `status: ACTIVE`
- matching request and embedded template IDs
- valid desktop-template payload

Verified API result:

```json
{
  "status": "published",
  "templateId": "cloud3-hosted-smoke-20260921",
  "version": 1,
  "publicationStatus": "ACTIVE"
}
```

The immutable object was created at:

```text
document-builder/templates/cloud3-hosted-smoke-20260921/versions/1.json
```

## 9. Verify version 1 persistence

Verify the immutable template object:

```bash
gcloud storage ls --long \
  gs://pdf-gen-509308-document-builder-assets/document-builder/templates/cloud3-hosted-smoke-20260921/versions/
```

Verify the Firestore current pointer:

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://firestore.googleapis.com/v1/projects/pdf-gen-509308/databases/(default)/documents/documentBuilderTemplates/cloud3-hosted-smoke-20260921" \
  | python3 -m json.tool
```

Verify immutable version metadata:

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://firestore.googleapis.com/v1/projects/pdf-gen-509308/databases/(default)/documents/documentBuilderTemplates/cloud3-hosted-smoke-20260921/versions/1" \
  | python3 -m json.tool
```

The current and version documents matched the template ID, version, status, object path, publication format, SHA-256, and timestamps.

## 10. Publish a version-safe version 2 with an image

Version 2 was created from version 1, updated, and given an embedded PNG image. The publish request used:

- `version: 2`
- `expectedVersion: 1`
- `status: ACTIVE`

The `expectedVersion` field prevents stale clients from silently overwriting a newer cloud version.

Verified API result:

```json
{
  "status": "updated",
  "templateId": "cloud3-hosted-smoke-20260921",
  "version": 2,
  "publicationStatus": "ACTIVE"
}
```

## 11. Verify immutable versions and content-addressed assets

Verified Cloud Storage objects:

```text
document-builder/templates/cloud3-hosted-smoke-20260921/versions/1.json
document-builder/templates/cloud3-hosted-smoke-20260921/versions/2.json
document-builder/assets/431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460.png
```

Observed sizes:

- version 1 JSON: 685 bytes
- version 2 JSON: 900 bytes
- PNG asset: 68 bytes

Firestore current metadata advanced to version 2, immutable `versions/1` remained preserved, and `versions/2` contained the matching template SHA, object path, and asset manifest.

## 12. Prove restart survival

A fresh Cloud Run revision was forced without changing repository behavior:

```bash
gcloud run services update pdf-doc-gen-api-staging \
  --project=pdf-gen-509308 \
  --region=us-central1 \
  --update-env-vars=CLOUD3_PERSISTENCE_SMOKE=restart-20260921 \
  --revision-suffix=restart-smoke
```

Verify traffic:

```bash
gcloud run services describe pdf-doc-gen-api-staging \
  --project=pdf-gen-509308 \
  --region=us-central1 \
  --format="table(status.latestReadyRevisionName,status.traffic[].percent,status.url)"
```

Verified revision:

```text
pdf-doc-gen-api-staging-restart-smoke
```

It served 100% of traffic.

## 13. Generate a PDF from persisted version 2

```bash
TOKEN="$(gcloud auth print-identity-token)"

curl --fail-with-body --silent --show-error \
  -D /tmp/cloud3-pdf-headers.txt \
  -o /tmp/cloud3-persistence-smoke.pdf \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "$SERVICE_URL/api/v1/documents/generate" \
  --data-binary '{
    "templateId": "cloud3-hosted-smoke-20260921",
    "templateVersion": 2,
    "output": {
      "format": "pdf",
      "fileName": "cloud3-persistence-smoke"
    },
    "data": {
      "invoiceNo": "INV-CLOUD3-002"
    }
  }'
```

Inspect the result:

```bash
sed -n '1,20p' /tmp/cloud3-pdf-headers.txt
file /tmp/cloud3-persistence-smoke.pdf
wc -c /tmp/cloud3-persistence-smoke.pdf
od -An -t x1 -N5 /tmp/cloud3-persistence-smoke.pdf
```

Verified evidence:

- HTTP `200`
- `content-type: application/pdf`
- template ID `cloud3-hosted-smoke-20260921`
- template version `2`
- page count `1`
- PDF version `1.4`
- file size `1,378` bytes
- first five bytes: `25 50 44 46 2d` (`%PDF-`)

This proved Firestore/GCS retrieval, asset hydration, integrity validation, restart persistence, and shared renderer reuse.

## 14. Code and CI gates

Before merge:

- `npm run typecheck` — PASS
- `npm test` — PASS: 73/73 files and 407/407 tests
- `npm run build` — PASS
- focused CLOUD-3 tests — PASS: 3/3 files and 9/9 tests
- PR Code Health — PASS
- PR Container Smoke — PASS

PR #7 was merged using expected head SHA `93ad8fb73509cc0d63bc8c95581be183d314f921`.

After merge:

- main commit: `c2fce635d4678ef9f4e2ac41e3fe371559de5ec7`
- Code Health run #105 — PASS

## Troubleshooting notes

### No active gcloud account

If a command reports that no active account is selected:

```bash
gcloud auth list
gcloud config set account YOUR_ACCOUNT_EMAIL
gcloud config set project pdf-gen-509308
```

Use the authenticated account already authorized for this project. Do not copy tokens or credentials into documentation.

### Template version conflict

`TEMPLATE_VERSION_CONFLICT` means the requested version already exists or `expectedVersion` does not match the current cloud version.

For an existing version 1 template, the next valid update is:

```json
{
  "version": 2,
  "expectedVersion": 1
}
```

Never overwrite an immutable historical version.

### Private API returns authorization errors

The service intentionally uses `--no-allow-unauthenticated`. Cloud Shell tests must send an identity token. Direct Desktop access will require the CLOUD-5 authentication contract.

### Do not depend on Cloud Run filesystem persistence

Cloud Run container storage is ephemeral. In cloud mode, templates and assets must be stored in Firestore and Cloud Storage. The application must fail fast when cloud configuration is incomplete; it must not silently fall back to local filesystem storage.

## Completion and next phase

CLOUD-3 is closed at **100% Complete — MERGED / POST-MERGE CI PASS**.

Next planned phase: **CLOUD-4 — Hosted Generation Hardening**.

CLOUD-5 will add external caller authentication. Until then, keep the hosted API private.
