# DB-6B Fix14 — Batch Document Generation & Combined PDF

Baseline: Git `main` commit `9fb35800120e8da06ca0bacbee394566769b2e9e` (Fix13.3 final verified gate).

## Goal

Add multi-document generation without changing the verified single-document API path.

Existing route remains unchanged:

- `POST /api/v1/documents/generate` → one PDF/DOCX per request.

New additive route:

- `POST /api/v1/documents/generate/batch`

## Modes

### Separate

`output.outputMode: "separate"`

Each input document is rendered independently through the existing `generate()` path. The HTTP response is JSON containing one Base64 file entry per document.

This mode supports the same headless formats as single generation:

- `pdf`
- `docx-editable`

`docx-exact` keeps the existing headless restriction.

### Combined

`output.outputMode: "combined"`

All input documents are rendered independently and appended into one PDF using the existing tested `CombinedPdfRenderer`.

Combined mode is PDF-only. It reuses the same TemplateEngine, desktop-parity calculations, formula calculations, dynamic-table pagination, header/footer behavior, and physical page geometry as single generation.

No partial combined PDF is returned if one document fails.

## Request example

```json
{
  "templateId": "invoice-v1",
  "output": {
    "format": "pdf",
    "outputMode": "combined",
    "fileName": "September-Invoices",
    "pageNumbering": "per-document"
  },
  "documents": [
    {
      "id": "INV-001",
      "data": {
        "invoiceNo": "INV-001",
        "items": []
      }
    },
    {
      "id": "INV-002",
      "data": {
        "invoiceNo": "INV-002",
        "items": []
      }
    }
  ]
}
```

## Delivery behavior

- Combined + omitted `responseMode` → raw PDF binary (same delivery style as single generation).
- Combined + `responseMode: "base64"` → JSON envelope with one Base64 PDF.
- Separate → JSON collection with one Base64 file per input document.
- Separate + explicit `responseMode: "binary"` is rejected because one HTTP binary response cannot safely represent multiple independent files without introducing ZIP/multipart semantics.

## Page numbering

Combined PDF supports:

- `per-document` (default): each document starts again at Page 1.
- `global`: page numbering spans the complete combined PDF.

## Compatibility / safety

- Existing single route and request contract are unchanged.
- Existing single generation service remains the implementation used by Separate mode.
- Combined mode reuses `CombinedPdfRenderer`; no second PDF renderer or page-merging implementation was introduced.
- Duplicate caller document IDs are made unique internally instead of being silently dropped.
- Request body limits continue to apply to the whole batch.
- Combined DOCX is intentionally not introduced in this phase.

## Verification

Automated coverage includes:

- legacy single route stays on `generate()`;
- combined batch route uses `generateBatch()`;
- separate batch returns multiple Base64 files;
- invalid separate-binary and combined-DOCX combinations are rejected before generation;
- real HTTP smoke generates two independent invoices into one combined PDF;
- real HTTP smoke generates two separate PDFs in one JSON response.

Final gate: Node 20 CI must pass `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`.
