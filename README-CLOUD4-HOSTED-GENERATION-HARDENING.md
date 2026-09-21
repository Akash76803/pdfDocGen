# CLOUD-4 — Hosted Document Generation Hardening

Baseline: `main@6b4b2e5c2db487d1db32d4aad6d374afcc0d372c`

## Goal

Run the existing shared generation engine safely behind the private Cloud Run API for single, separate-batch, and combined-PDF requests. CLOUD-4 adds hosted-runtime guardrails; it does not duplicate rendering, replace the CLOUD-3 repository, or introduce external caller authentication.

## Supported generation routes

- `POST /api/v1/documents/generate`
- `POST /api/v1/documents/generate/batch` with `outputMode: "separate"`
- `POST /api/v1/documents/generate/batch` with `outputMode: "combined"` for PDF

All routes resolve the requested `ACTIVE` template/version and its assets through the configured `TemplateRepository`, then use the existing `HeadlessDocumentGenerationService`.

## Runtime guard configuration

| Variable | Default | Absolute ceiling | Purpose |
| --- | ---: | ---: | --- |
| `API_GENERATION_TIMEOUT_MS` | `240000` | `295000` | API generation deadline below the 300-second Cloud Run request timeout |
| `API_ABSOLUTE_GENERATION_TIMEOUT_MS` | `295000` | — | Deployment-controlled timeout ceiling |
| `API_MAX_BATCH_DOCUMENTS` | `100` | `500` | Maximum documents accepted in one batch |
| `API_ABSOLUTE_MAX_BATCH_DOCUMENTS` | `500` | — | Deployment-controlled batch ceiling |

Invalid, zero, negative, or non-integer environment values fall back to safe defaults. Requested values above an absolute ceiling are clamped.

## Failure contract

| Code | HTTP status | Meaning |
| --- | ---: | --- |
| `BATCH_LIMIT_EXCEEDED` | `413` | The batch contains more documents than the effective configured ceiling |
| `GENERATION_TIMEOUT` | `504` | Generation did not complete inside the effective hosted deadline |
| `INVALID_REQUEST` | `400` | Includes invalid explicit `templateVersion`; it must be a positive integer |

Error responses remain structured as `{ "error": { "code", "message", "details" } }`.

## Health contract

`GET /health` reports the effective non-secret limits:

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

The same effective hosted limits are included in safe structured startup diagnostics.

## Scope boundaries

- CLOUD-3 continues to own Firestore/GCS persistence, immutable versions, asset hydration, and integrity verification.
- CLOUD-5 will own external authentication, client identity, access control, and secret rotation.
- CLOUD-6 will own full request correlation, audit logging, metrics, and production monitoring.
- The Cloud Run service remains private until CLOUD-5 is complete.

## Verification plan

1. Typecheck and focused configuration/API/e2e tests.
2. Full repository test suite and production build.
3. Container smoke on Linux.
4. Private Cloud Run staging deployment.
5. Authenticated health, single PDF, separate batch PDF, combined PDF, batch-limit rejection, and short-deadline timeout smoke.
6. Confirm PDF signatures, content types, page/document counts, structured errors, and no regression to CLOUD-3 versioned template/asset retrieval.
