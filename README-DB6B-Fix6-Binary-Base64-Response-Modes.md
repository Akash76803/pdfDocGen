# DB-6B Fix6 — Binary + Base64 Response Modes

`POST /api/v1/documents/generate` supports two success delivery modes:

- `output.responseMode: "binary"` — default. Returns raw PDF/DOCX bytes with file headers.
- `output.responseMode: "base64"` — compatibility mode. Returns the existing JSON envelope with Base64 file content.

Errors remain structured JSON in both modes.

## Binary response headers

- `Content-Type`
- `Content-Disposition`
- `Content-Length`
- `X-Document-Job-Id`
- `X-Document-Template-Id`
- `X-Document-Template-Version` when available
- `X-Document-Format`
- `X-Document-Page-Count` when available
- `X-Document-Warnings` when warnings exist

The local CORS bridge exposes these metadata headers to localhost/Tauri browser clients.

The Template Builder **JSON Body → Copy Request** action now emits `"responseMode": "binary"` explicitly.
