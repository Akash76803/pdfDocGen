# DB-6B Fix10 — Desktop / API Renderer Parity

Baseline: Git `main` commit `00eb2fe616749d8991c3ed7f52bbf6c05c924d1b`.

## Goal
Make server-side API PDF generation consume the same resolved business/document semantics as the Desktop Builder instead of independently re-interpreting table formulas, grouped summaries and pagination tokens.

## Implemented
- Added a headless desktop-parity stage before document formulas and TemplateEngine rendering.
- Materializes calculated Dynamic Table columns in dependency order into API item rows.
- Materializes grouped/HSN summary sources from the calculated rows, including group/sum/count/avg/min/max and grouped formula outputs.
- Fixed grouped-table detection for string `groupBy` arrays.
- Preserves grouped synthetic keys such as `__grouped_1` in footer aggregates.
- Fixed footer aggregates that reference calculated columns (for example Discount).
- Static blank footer cells are no longer formatted as numeric zero/0.00%.
- Aggregate Formula Fields such as `SUM([Final Amount])` are now emitted as `items[]` request dependencies by Template Builder JSON Body/Copy Request instead of incorrectly becoming document-root fields.
- Added API flow-layout projection using Builder row/gap/width/distribution settings before converting elements to absolute native PDF geometry.
- Deferred `pageNumber` / `totalPages` tokens until physical PDF page rendering so a two-page document renders `1 and 2` and `2 and 2`.
- Removed editor-only text-element fill from API native TEXT/FIELD background so normal Builder text does not get unintended blue bands.
- Footer aggregate/formula values use their source-column display format where appropriate.

## Real Tax Invoice parity smoke
Used the saved Tax Invoice template `7004e453-602e-4173-be10-7239d04b3b3d` and representative API item data.

Verified:
- 2 physical pages.
- Zero TemplateEngine warnings.
- Discount rows: 396.00 / 434.00 / 1,124.00.
- Taxable rows: 1,584.00 / 1,736.00 / 4,496.00.
- Main totals: quantity 4, basic value 9,770.00, discount 1,954.00, taxable 7,816.00.
- Taxable words resolved internally.
- Net payable words resolved internally when item-level Final Amount input is supplied by the request contract.
- HSN grouped summary: taxable 7,816.00, GST 18.00%, Total GST 1,406.88, CGST 703.44, SGST 703.44, IGST 0.00, TOTAL 9,222.88.
- Page tokens: `1 and 2` / `2 and 2`.
- Header/logo/decorative images, main table, totals block, grouped HSN table and body shapes render in the same broad positions as Desktop UI export.

## Verification
- Targeted semantic TypeScript check: PASS.
- contracts/template-engine/renderer-sdk/renderer-pdf/renderer-docx/generation-core TypeScript build: PASS.
- Real saved-template runtime smoke: PASS.
- PDF text/value inspection: PASS.
- Page 1 + Page 2 raster visual inspection: PASS for the targeted parity items.
- Focused Vitest command was attempted but timed out in this execution environment.
- Full root npm gate was not marked PASS because the execution environment is Node 22 while the repository requires Node 20 and dependency installation is not reliable here.

## Remaining native-renderer fidelity boundaries
This is still a server-side native PDF renderer, not a browser screenshot. Core PDF fonts may not reproduce every browser-only glyph/font exactly (notably the Indian rupee glyph in some native font paths), and advanced CSS/image/shape effects can still differ from Exact browser export. These are renderer-coverage items, not business-data resolution differences.
