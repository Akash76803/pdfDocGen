# CLOUD-4 Hosted Generation Hardening — Deployment & Verification Runbook

Date: 2026-09-21  
Repository: Akash76803/pdfDocGen  
Branch: feat/cloud4-hosted-generation-hardening  
Deployment commit tested: 75ce06b39f6b4cbe7620e32c55c2f704068b3d71  
Pull request: #9 — CLOUD-4: Harden hosted document generation

## 1. Purpose

CLOUD-4 hardens hosted document generation behind the existing private Cloud Run API without duplicating the renderer or changing the CLOUD-3 Firestore/GCS persistence model.

This phase adds:

- configurable generation deadlines
- absolute hosted timeout ceilings
- configurable per-batch document limits
- absolute batch ceilings
- typed timeout and batch-limit errors
- explicit templateVersion validation
- health/startup diagnostics for effective non-secret limits
- Cloud Run deployment configuration for these limits

Authentication hardening remains CLOUD-5. Full logging, metrics, and audit remain CLOUD-6.

## 2. Google Cloud Staging Environment

Project: `pdf-gen-509308`  
Region: `us-central1`  
Service: `pdf-doc-gen-api-staging`  
Runtime service account: `pdf-doc-gen-api@pdf-gen-509308.iam.gserviceaccount.com`  
Firestore database: `(default)`  
Asset bucket: `pdf-gen-509308-document-builder-assets`

The service remained private throughout CLOUD-4 verification.

Primary deployment revision:

`pdf-doc-gen-api-staging-00003-2s8`

Timeout smoke revision:

`pdf-doc-gen-api-staging-timeout-smoke`

Restored normal-timeout revision:

`pdf-doc-gen-api-staging-timeout-restore`

## 3. CLOUD-4 Runtime Limits

Normal staging values:

- `API_MAX_BODY_MB=20`
- `API_ABSOLUTE_MAX_BODY_MB=50`
- `API_GENERATION_TIMEOUT_MS=240000`
- `API_ABSOLUTE_GENERATION_TIMEOUT_MS=295000`
- `API_MAX_BATCH_DOCUMENTS=100`
- `API_ABSOLUTE_MAX_BATCH_DOCUMENTS=500`

Health returned:

```json
{
  "status": "ok",
  "service": "document-builder-api",
  "phase": "CLOUD-4",
  "limits": {
    "requestBodyMb": 20,
    "absoluteMaxMb": 50,
    "generationTimeoutMs": 240000,
    "maxBatchDocuments": 100
  }
}
```

## 4. Test Template

Hosted verification reused the persisted CLOUD-3 template:

- templateId: `cloud3-hosted-smoke-20260921`
- templateVersion: `2`
- active version: 2
- persistence source: existing CLOUD-3 Firestore/GCS repository
- version 2 includes a persisted PNG asset

This verifies that CLOUD-4 generation still works through the existing CLOUD-3 storage path.

## 5. Local & CI Verification Before Hosted Smoke

Local verification on CLOUD-4 implementation:

- `npm run typecheck` — PASS
- focused API suite — PASS, 4/4 files and 35/35 tests
- full tests — PASS, 73/73 files and 413/413 tests
- production build — PASS
- `git diff --check` — PASS

GitHub Actions on head `75ce06b`:

- CLOUD-1 Container Smoke #7 — PASS
- Code Health #108 — PASS

## 6. Private Cloud Run Deployment

Deployment source commit:

`75ce06b39f6b4cbe7620e32c55c2f704068b3d71`

The branch was deployed to the existing private staging service.

Result:

- revision `pdf-doc-gen-api-staging-00003-2s8`
- 100% traffic
- service remained private

## 7. Private Invocation Path

Direct `gcloud auth print-identity-token` requests returned HTTP 401 even after granting `roles/run.invoker` to the active developer identity.

For hosted verification, the supported authenticated developer proxy path was used:

```bash
gcloud run services proxy pdf-doc-gen-api-staging \
  --project=pdf-gen-509308 \
  --region=us-central1 \
  --port=8080
```

All application-level hosted smokes below were executed through `http://localhost:8080`.

The direct-token behavior is an authentication-path concern and remains outside CLOUD-4; authentication hardening is CLOUD-5.

## 8. Hosted Smoke Results

### 8.1 Health — PASS

Endpoint:

`GET /health`

Verified:

- status `ok`
- service `document-builder-api`
- phase `CLOUD-4`
- requestBodyMb `20`
- absoluteMaxMb `50`
- generationTimeoutMs `240000`
- maxBatchDocuments `100`

### 8.2 Single PDF — PASS

Endpoint:

`POST /api/v1/documents/generate`

Result:

- HTTP 200
- `Content-Type: application/pdf`
- template ID `cloud3-hosted-smoke-20260921`
- template version `2`
- page count `1`
- PDF 1.4
- size `1385` bytes
- signature `%PDF-`

### 8.3 Separate Batch — PASS

Endpoint:

`POST /api/v1/documents/generate/batch`

Request:

- format `pdf`
- `output.outputMode=separate`
- 2 documents

Result:

- HTTP 200
- JSON response
- `documentCount=2`
- `pageCount=2`
- two PDF files returned as base64
- each file `application/pdf`
- each file 1 page
- each file 1384 bytes
- document IDs:
  - `INV-CLOUD4-BATCH-001`
  - `INV-CLOUD4-BATCH-002`

### 8.4 Combined PDF — PASS

Endpoint:

`POST /api/v1/documents/generate/batch`

Request:

- format `pdf`
- `output.outputMode=combined`
- 2 documents

Result:

- HTTP 200
- `Content-Type: application/pdf`
- page count `2`
- template version `2`
- PDF 1.4
- size `1975` bytes
- signature `%PDF-`

### 8.5 Batch Ceiling Guard — PASS

A 101-document batch was submitted while the effective maximum was 100.

Result:

- HTTP 413
- error code `BATCH_LIMIT_EXCEEDED`
- `documentCount=101`
- `maxDocuments=100`

This confirms the request is rejected before hosted batch generation proceeds.

### 8.6 Invalid Explicit Template Version — PASS

A single-generation request used:

`templateVersion=0`

Result:

- HTTP 400
- error code `INVALID_REQUEST`
- message: `templateVersion must be a positive integer when provided.`

### 8.7 Timeout Guard — PASS

For the timeout smoke only:

`API_GENERATION_TIMEOUT_MS=10`

Cloud Run created revision:

`pdf-doc-gen-api-staging-timeout-smoke`

Health confirmed:

`generationTimeoutMs=10`

Generation result:

- HTTP 504
- error code `GENERATION_TIMEOUT`
- configured timeout `10` ms
- effective timeout `10` ms
- absolute timeout `295000` ms

After the smoke, the normal timeout was restored:

`API_GENERATION_TIMEOUT_MS=240000`

Cloud Run created revision:

`pdf-doc-gen-api-staging-timeout-restore`

Final health confirmed:

`generationTimeoutMs=240000`

## 9. CLOUD-4 Acceptance Status

Hosted verification status: PASS.

Verified end to end:

- private staging deployment
- persisted template retrieval
- single PDF generation
- separate batch generation
- combined PDF generation
- configured batch ceiling
- explicit version validation
- hosted deadline enforcement
- safe restoration of normal runtime timeout

## 10. Security Boundary

The Cloud Run service must remain private through CLOUD-4.

Do not enable unauthenticated access.

CLOUD-5 owns authentication/security hardening.

## 11. Rollback Notes

If a CLOUD-4 staging regression is detected:

1. route traffic back to the last known-good Cloud Run revision
2. restore normal generation timeout to `240000`
3. restore max batch documents to `100`
4. confirm `/health`
5. rerun single PDF generation against `cloud3-hosted-smoke-20260921` version 2
6. confirm CLOUD-3 persisted template retrieval remains intact

## 12. Finalization Checklist

Before marking CLOUD-4 complete:

- final runbook committed to PR #9
- GitHub CI green on the final PR head
- PR #9 merged to `main`
- post-merge GitHub CI green
- authoritative project tracker updated to 100%
- next phase set to CLOUD-5 Authentication & Security
