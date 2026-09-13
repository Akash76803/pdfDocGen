# DB-4G Fix3 — Grouped Summary Column Order

**Status:** Implemented / manual QA pending  
**Date:** 2026-09-13

## Problem
Grouped Summary columns could change or lose their intended visual ordering after reopening the shared Create/Edit configuration and applying changes. The editor also had no explicit way to reorder output columns.

## Implementation
- Added **Move column left** / **Move column right** controls beside every Grouped Summary output column in the same Create/Edit configuration UI.
- Reordering updates the Grouped output mapping immediately.
- Final Summary Row column settings move together with their corresponding output column.
- Applying edits keeps the same table instead of creating a duplicate.
- Reconfiguration now preserves width, alignment, formatting, manual-width state, header style and body-cell style by **logical grouped-column identity** instead of only by array index.
- Invalid/incomplete draft mappings no longer shift Final Summary settings onto a different valid output column when Apply is clicked.

## QA
1. Create a grouped table with `Taxable | Total GST | CGST | SGST | IGST | HSN | TOTAL | GST %`.
2. Open **Edit Grouped Summary Configuration**.
3. Move HSN to the first position and arrange the remaining columns with left/right controls.
4. Apply, reopen Edit, and verify the same order remains.
5. Resize/format several columns, reorder them, Apply, and verify each logical column keeps its own width/formatting.
6. Enable Final Summary Row, assign different operations, reorder columns, and verify the summary operation follows its column.
7. Save/reload and verify order persists.
