# DB-2 Fix5 + DB-5C + Template Management v2

Implemented 2026-09-14 on top of DB-2 Fix4 / DB-5B Fix2 baseline.

## DB-2 Fix5 — Content Border Alignment + Offset
- Added persisted `borderAlignment`: Inside / Center / Outside.
- Added persisted `borderOffsetMm` (unit-aware inspector input).
- Inside moves inward from margin reference; Center centers stroke on the reference and supports outward offset; Outside moves toward paper edge.
- Outside movement is clamped so the content border does not escape the physical page.
- Existing templates normalize to Inside + 0 offset.

## DB-5C — Bulk Document Generation v1
- Generate page now has Single / Bulk mode.
- Multi-select Parent/Document IDs with Select all / Clear.
- Builds one generation request per selected document using the same DB-5B filename resolution and verified Builder renderers.
- Sequential orchestration: PDF / DOCX Exact / DOCX Editable are generated one document at a time through the existing renderer path.
- Progress is persisted locally and survives route transitions.
- Success/failure remains in Generation History; completed bulk runs show failed count and Retry failed.
- v1 intentionally uses sequential individual downloads. ZIP/combined-PDF packaging is a later packaging enhancement; renderer logic was not duplicated.

## Template Management v2
- Added statuses Draft / Saved / Published / Archived.
- Added category + version metadata with backward-compatible defaults.
- Library status filter (Active/All/Draft/Saved/Published/Archived).
- Card actions: Rename, Duplicate, New Version, Publish, Archive/Restore, Delete.
- Duplicate/new version are independent Draft entries and never overwrite the source template.
- Active-template legacy key is still synchronized so Generate and all existing renderers remain compatible.

## Verification
- TypeScript transpile syntax checks PASS for all six changed TS/TSX files.
- Existing full Vitest command did not finish within the available verification window; manual QA remains required.

## DB-5C Fix1 — Combined Bulk PDF
Bulk PDF generation now supports `Separate PDFs` or `Combined PDF`. Combined mode uses the same exact Preview capture per invoice, appends all pages in selected document order, downloads once at the end, and fails safely without a partial PDF if any invoice fails. See `docs/DB5C_FIX1_COMBINED_BULK_PDF.md`.
