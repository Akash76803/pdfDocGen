# DB-4.3B Fix1 — Summary Row Full Cell Grid

## Requirement
A new summary row must start with the same base cell count as the current table column count. The user should not need a separate Add Cell action. Layout customization is done through the existing rowSpan/colSpan controls.

## Behavior
- `+ Add custom total / summary row` creates one cell per current visual table column.
- First cell defaults to `Subtotal` and bold text.
- Last cell defaults to Aggregate → SUM, Summary name `Subtotal`, Currency, bold, right aligned.
- Intermediate cells remain empty and individually selectable/editable.
- User may change `colSpan`/`rowSpan` on summary cells to create a label/value layout.
- Later table column add/delete operations continue to flow through the shared span-aware row structure helpers so summary rows remain structurally aligned.
- No separate summary-cell add button is required.

## Example
For a 5-column table, a new summary row begins as:

`[Subtotal] [ ] [ ] [ ] [SUM result]`

The user can then set the first cell `colSpan = 4` to create a merged label area if desired.

## Compatibility
Existing saved summary rows are unchanged. This affects newly added summary rows only.
