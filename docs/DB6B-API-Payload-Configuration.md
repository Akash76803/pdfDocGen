# DB-6B API Payload Configuration

The document generation API does not use a fixed route-level body-size limit.

## Environment variables

- `API_MAX_BODY_MB` — requested runtime request-body limit. Default: `20` MB.
- `API_ABSOLUTE_MAX_BODY_MB` — runtime safety ceiling. Default: `50` MB.

The effective limit is `min(API_MAX_BODY_MB, API_ABSOLUTE_MAX_BODY_MB)`.
Invalid, empty, zero, or negative values fall back to the safe defaults.

Examples:

```env
API_MAX_BODY_MB=30
API_ABSOLUTE_MAX_BODY_MB=50
```

Effective limit: 30 MB.

```env
API_MAX_BODY_MB=80
API_ABSOLUTE_MAX_BODY_MB=50
```

Effective limit: 50 MB.

## Enforcement

`POST /api/v1/documents/generate` checks the declared `Content-Length` before reading the request when available and also counts streamed bytes while reading. A request above the effective limit returns HTTP `413` with code `PAYLOAD_TOO_LARGE` and limit metadata.

`GET /health` exposes the active request-body and absolute maximum values for runtime verification.
