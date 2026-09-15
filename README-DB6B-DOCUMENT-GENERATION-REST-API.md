# DB-6B — Document Generation REST API

Baseline: Git main commit `74da75458369dabcc1cf57335ed250bd7d9de81a` (DB-6A verified).

## Implemented
- New headless workspace app: `apps/api`
- New shared boundary package: `packages/generation-core`
- `GET /health`
- `POST /api/v1/documents/generate`
- Stable request contract: `templateId`, optional `templateVersion`, `output`, `data`
- Supported output contract values: `pdf`, `docx-exact`, `docx-editable`
- Synchronous completed response contract with `jobId`, output metadata and Base64 file payload
- 5 MB request limit
- Structured transport/request errors
- Unit/integration tests using an injected generation service

## Architecture rule
The API does **not** import React, Tauri, localStorage or IndexedDB. Rendering is reached through `DocumentGenerationService`. This keeps the HTTP layer reusable and prevents coupling the future server to the desktop UI.

## Intentional DB-6B boundary
This candidate completes the HTTP/API contract and generation-service seam. The production runtime adapter that converts a published Builder template + raw JSON into the existing renderer pipeline is intentionally not hard-wired to `apps/desktop`; that extraction/wiring is the next DB-6B integration step before this phase is marked COMPLETE.

The default `server.ts` uses `UnconfiguredDocumentGenerationService` and therefore returns HTTP 503 for generation until the headless renderer adapter is wired. Tests inject a real test adapter and verify request/response behavior.

## Example request
```json
{
  "templateId": "invoice-standard",
  "templateVersion": 1,
  "output": { "format": "pdf", "fileName": "INV-1001.pdf", "renderMode": "native-auto" },
  "data": {
    "invoiceNo": "INV-1001",
    "customer": { "name": "Acme" },
    "items": [{ "description": "Item A", "qty": 2, "rate": 100 }]
  }
}
```

## Validation ownership
Only transport/request-shape checks are included here. Template-schema validation and field-level error contracts belong to DB-6C.

## Async ownership
This endpoint is synchronous in DB-6B. Queue/progress/job polling belongs to DB-6D.
