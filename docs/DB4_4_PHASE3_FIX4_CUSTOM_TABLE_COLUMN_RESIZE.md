# DB-4.4 Phase 3 Fix4 — Custom Table Column Resize

## Goal
Make manual column sizing directly usable on Custom Tables, including layouts that contain `rowSpan` / `colSpan` merged cells.

## Behavior
- When a table cell is selected, a lightweight column ruler appears above the table.
- Each visual column boundary has a drag handle independent of the cell structure below it.
- Dragging a boundary resizes the two adjacent columns while preserving the table's total width.
- The ruler works for Custom and Dynamic tables and does not depend on a header row being present.
- `rowSpan` and `colSpan` cells are not split or structurally changed by resizing; a merged cell simply consumes the combined widths of the columns it spans.
- Existing Column Structure numeric Width, Fit Content, Equal Width and Reset Auto controls remain available.

## QA
1. Create a 3-column Custom Table and add a `rowSpan` cell.
2. Select any cell so the ruler appears.
3. Drag boundary 1 and boundary 2.
4. Confirm the rowSpan remains intact and only column widths change.
5. Add a `colSpan=2` cell and repeat. Confirm the merged cell width equals the total of its two underlying columns.
6. Save/reload and verify manual widths persist.
