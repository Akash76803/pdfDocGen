# DB-6B — Headless PDF + Editable DOCX Generation

## What changed
- API server now uses `HeadlessDocumentGenerationService`.
- Existing native PDF generation remains available for `output.format = "pdf"`.
- Added server-safe `output.format = "docx-editable"` generation using the existing native WordprocessingML DOCX builder.
- Added pure `RenderModel -> EditableDocxPage` mapping inside `generation-core`; no DOM, React, Tauri, `window`, `localStorage`, IndexedDB, or html2canvas dependency is required by the API path.
- Added `sizeBytes` to synchronous output metadata without removing the existing Base64 `file.encoding/file.content` contract.
- Added typed `EXACT_DOCX_UNAVAILABLE` error for `docx-exact` instead of silently downgrading fidelity.
- Preserved `NativePdfDocumentGenerationService` as a backward-compatible alias while the API server uses the broader service.
- Added real generation-core tests for PDF and editable DOCX and HTTP E2E smoke tests for both formats.

## Supported output behavior
| Request | Headless API behavior |
| --- | --- |
| `pdf` + `native-auto` or omitted render mode | Generates real PDF |
| `pdf` + `exact` | `422 EXACT_RENDER_UNAVAILABLE` |
| `docx-editable` | Generates real editable DOCX |
| `docx-exact` | `422 EXACT_DOCX_UNAVAILABLE` |

## Editable DOCX notes
The headless editable DOCX path preserves resolved text/table content as native Word elements. Word may reflow editable content differently from an Exact raster preview. PNG/JPEG data-URL images can be embedded; image sources that require browser/local-asset resolution are represented with a warning/fallback rather than unsafe browser coupling.

## Verification performed in this environment
- `tsc -b packages/generation-core --pretty false`: PASS after fixing a strict unused-parameter diagnostic.
- Direct compiled generation smoke: PASS.
  - PDF signature `%PDF-`, valid PDF 1.4, 1 page.
  - DOCX signature `PK`, recognized as Microsoft Word 2007+, ZIP integrity PASS.
  - Dynamic invoice/table values were present in DOCX XML.
- HTTP runtime smoke through `POST /api/v1/documents/generate`: PASS for PDF and `docx-editable`.
- HTTP `docx-exact`: PASS with `422 EXACT_DOCX_UNAVAILABLE`.
- Full `npm ci` was attempted but dependency download timed out in this execution environment. Consequently the full root `npm run typecheck`, `npm test`, and `npm run build` cannot be honestly marked PASS here; API TypeScript semantic build is blocked specifically by the missing installed `@types/node` package.


## Response delivery

- `responseMode: "binary"` is the default for production file delivery.
- `responseMode: "base64"` keeps the JSON/Base64 compatibility response.
- Error responses remain JSON regardless of response mode.
