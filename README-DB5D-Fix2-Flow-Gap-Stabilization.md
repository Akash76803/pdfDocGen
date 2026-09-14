# DB-5D Fix2 — Bulk Flow Gap Stabilization

## Issue
During bulk / combined PDF generation, the vertical gap between a Dynamic Table and the following Flow blocks could grow from invoice to invoice. A prior invoice could leave a large measured/logical table height in the reusable hidden renderer. `materializeBodyFlowPages()` initialized the row end from that stale logical height even when the current invoice's runtime table paginator reported a much shorter physical table span.

## Fix
- Runtime materialized spans are now authoritative for vertical reservation.
- Single-page Dynamic Tables use the current invoice's `lastPageUsedHeightPx` instead of stale `element.height` / `flowRowHeightPx`.
- Page-fit checks also use the runtime span height, preventing a short current table from being pushed to a phantom continuation page because of an earlier invoice's taller cached height.
- Rows without runtime spans retain the existing tallest-row/cache behavior.
- Multi-page table continuation behavior is preserved.

## Regression tests added
- Short runtime table span ignores a stale 620px logical table height and places the following summary row directly after current content.
- A short runtime span does not jump to a new page because of a stale large logical height.

## Scope
No change to Formula, table calculations, PDF encoding, Combined PDF ordering, Header/Footer, or normal non-materialized Body Flow behavior.
