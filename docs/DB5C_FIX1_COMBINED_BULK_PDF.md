# DB-5C Fix1 — Combined Bulk PDF

## Goal
Allow Bulk generation to place all selected invoices into one PDF instead of downloading one PDF per invoice.

## UX
Bulk + PDF now exposes:
- Separate PDFs — existing DB-5C v1 behavior.
- Combined PDF — captures every selected invoice independently and appends its already-materialized pages into one final PDF.

A Combined PDF Name field controls the final download name.

## Fidelity / Pagination contract
The combined path reuses the existing DB-4.5 exact Preview raster capture at 192 DPI. Each invoice still gets its own record context, Body Flow, dynamic-table pagination, Header/Footer and physical page size. Only the final PDF container is shared.

The batch is intentionally processed through the existing Builder route one invoice at a time. This preserves the verified DB-5B record hydration/render-stability behavior instead of trying to switch many record contexts inside one React render closure.

## Safety
- No individual PDF is downloaded while Combined PDF is selected.
- A combined PDF is finalized only when all expected invoice captures are present.
- If any invoice fails, the in-memory combined session is discarded and the batch stops. No partial combined PDF is downloaded.
- Retry Combined Batch regenerates the complete batch, not only the failed invoice, because a valid combined file must contain every selected invoice.
- Refresh/reload during a running batch safely prevents partial finalization because captured PDF parts are session-memory only.

## Compatibility
- Separate PDFs unchanged.
- Single generation unchanged.
- DOCX Exact / Editable unchanged.
- Existing BulkGenerationState remains backward compatible because outputMode/combinedFileName are optional.
