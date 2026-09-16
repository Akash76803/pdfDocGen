# DB-6B Dynamic API Payload Configuration

This patch replaces the previous fixed 5 MB request-body guard with runtime configuration.

## Runtime settings

```env
API_MAX_BODY_MB=20
API_ABSOLUTE_MAX_BODY_MB=50
```

- Both values are runtime-configurable.
- Defaults are 20 MB and 50 MB when values are missing/invalid.
- Effective request limit = `min(API_MAX_BODY_MB, API_ABSOLUTE_MAX_BODY_MB)`.
- `GET /health` reports the active effective and absolute limits.
- Oversized generation requests return HTTP 413 / `PAYLOAD_TOO_LARGE` with limit details.
- Enforcement occurs both before body read (when `Content-Length` is present) and during streamed body reads.

## Verification performed in packaging environment

- Source/transpile syntax check for modified API/config/test files: PASS.
- Legacy 5 MB hardcoded guard search: no matches in API source.
- Full `npm ci` was attempted but the execution environment timed out while installing dependencies.
- Full `npm run typecheck` was attempted after the partial install but could not complete because type-definition packages were incomplete/missing in that environment.
- Focused Vitest execution was attempted but timed out in the same incomplete dependency environment.

Do not treat the environment-level dependency failure as a source PASS. Run the normal Node 20 gates locally when dependencies are available:

```bash
npm ci
npm run typecheck
npm test
npm run build
```
