# CLOUD-1 — Cloud API Foundation

Baseline: `main@c5c45cef47cc51c910a97f69b3384b5c30bf9eb8`

## Existing API confirmed

The current headless Document Builder API already provides:

- `GET /health`
- `PUT /api/v1/templates/{templateId}`
- `DELETE /api/v1/templates/{templateId}`
- `POST /api/v1/documents/generate`
- `POST /api/v1/documents/generate/batch`
- single PDF and editable DOCX generation
- batch separate PDF output
- batch combined PDF output
- binary and Base64 response modes
- request body limits with an absolute cap
- structured error codes
- desktop-template to generation-contract adaptation
- headless conditional rendering, formulas, watermark and table behavior through the shared generation pipeline

## Cloud-readiness findings

### Ready / reusable

1. Generation is already headless and does not require the desktop UI for Native PDF.
2. The renderer returns in-memory bytes, which is suitable for HTTP/Cloud Run responses.
3. The generation service depends on a `TemplateRepository` interface, so cloud storage can replace the filesystem repository without rewriting the PDF engine.
4. Cloud Run supplies `PORT`; the API now has a runtime server-config resolver.
5. Health, validation, body limits and E2E generation tests already exist.

### Gaps to close

1. **Template persistence**
   - Current production wiring uses `FileSystemTemplateRepository`.
   - Cloud Run local filesystem must not be treated as durable template storage.
   - CLOUD-2/CLOUD-3 should introduce a persistent cloud repository while retaining filesystem support for local/offline mode.

2. **Server binding**
   - Local mode should remain loopback-only.
   - Cloud Run must listen on `0.0.0.0:$PORT`.
   - CLOUD-1 now detects Cloud Run via `K_SERVICE` and applies the cloud-safe host default.

3. **Authentication**
   - Current API routes do not enforce production authentication.
   - Authentication belongs to CLOUD-5; no anonymous public production deployment should be approved before that gate.

4. **CORS**
   - Current CORS allowlist intentionally supports localhost/127.0.0.1/Tauri only.
   - Server-to-server Salesforce Apex calls do not require browser CORS.
   - Future browser/web publisher origins should be explicit configuration rather than wildcard CORS.

5. **Exact rendering**
   - Headless `renderMode=exact` PDF and `docx-exact` intentionally return typed 422 errors.
   - Native/headless PDF is the cloud baseline.
   - Exact browser-materialized rendering remains a separate architecture decision.

6. **Operational controls**
   - Structured request IDs, production logs/metrics, rate limiting, idempotency and tenant identity are still roadmap items.

## CLOUD-1 implementation backlog

### Gate A — Runtime portability
- [x] Resolve host/port through testable configuration.
- [x] Preserve `127.0.0.1` local default.
- [x] Use `0.0.0.0` automatically under Cloud Run.
- [x] Honor Cloud Run `PORT`.
- [ ] Add container/Cloud Run deployment definition.
- [ ] Smoke-test `/health` inside a Linux container.

### Gate B — Repository boundary
- [ ] Keep `TemplateRepository` as generation-core boundary.
- [ ] Define cloud repository contract implementation plan.
- [ ] Ensure server composition can select local or cloud repository by environment without renderer changes.

### Gate C — Production configuration
- [ ] Define environment variables and validation.
- [ ] Add deployment-safe startup diagnostics without secrets.
- [ ] Document dev/stage/prod configuration.

### Gate D — Verification
- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Linux/container health smoke
- [ ] Single PDF HTTP smoke
- [ ] Batch combined PDF HTTP smoke

## Deferred to later roadmap phases

- Template publish/version API UX: CLOUD-2
- Persistent template and asset storage: CLOUD-3
- Hosted production generation deployment: CLOUD-4
- API key/OAuth/tenant security: CLOUD-5
- Logging/monitoring/audit: CLOUD-6
- Common ERP/CRM contract: INT-1
- Salesforce Record Page button: SF-1
