# DB-6B — Document Generation REST API

DB-6B provides the headless API boundary for document generation.

## Routes
- `GET /health`
- `POST /api/v1/documents/generate`

## Current generation support
- PDF `native-auto`: server-safe `TemplateEngine` + native `PdfRenderer`.
- PDF `exact`: rejected with `EXACT_RENDER_UNAVAILABLE` because Exact mode depends on the browser materialized-preview pipeline.
- DOCX `docx-editable`: server-safe native WordprocessingML generation from the resolved render model. Text and tables remain editable; PNG/JPEG data-URL images are embedded when present.
- DOCX `docx-exact`: rejected with `EXACT_DOCX_UNAVAILABLE` because Exact DOCX depends on the browser raster/materialized-preview pipeline.

## Runtime configuration
- `API_TEMPLATE_DIR` defaults to `./data/templates`.
- `API_MAX_BODY_MB` defaults to 20 MB.
- `API_ABSOLUTE_MAX_BODY_MB` defaults to 50 MB.
- Effective body limit is the lower of requested and absolute values.

## Template files
- default/latest template: `<templateId>.json`
- immutable version: `<templateId>.v<version>.json`

The filesystem repository is an adapter behind `TemplateRepository`; a database/object-storage-backed repository can replace it later without coupling HTTP routes to desktop browser storage.

## Response metadata
Successful generation supports two delivery modes. `output.responseMode: "binary"` is the default and returns raw PDF/DOCX bytes with `Content-Type`, `Content-Disposition`, `Content-Length`, and document metadata headers. `output.responseMode: "base64"` preserves the JSON envelope with format, file name, MIME type, byte size, optional page count/warnings, and Base64 file content. Errors remain structured JSON in both modes.
