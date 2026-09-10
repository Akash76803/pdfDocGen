# DB-4.3B — Aggregations + Summary Rows

Status: Implemented / Manual QA Pending

## Scope

Dynamic Table summary rows now calculate against only the current Parent / Document group. A summary cell can use:

- Custom Value
- Aggregate: SUM, COUNT, AVG, MIN, MAX
- Formula

Aggregate inputs can target imported fields or resolved Dynamic Table formula columns. Formula-mode summary cells support aggregate calls such as `SUM([Net Value])` and can reference named earlier summary values such as `[Subtotal]` or `[Tax Amount]`.

## Example

- Subtotal: Aggregate → SUM → Net Value; Summary Name = Subtotal
- Tax Amount: Formula → `[Subtotal] * 0.18`; Summary Name = Tax Amount
- Grand Total: Formula → `[Subtotal] + [Tax Amount]`; Summary Name = Grand Total

All values continue to use the existing DB-4.3A Data Type / Format controls, so totals can render as Currency, Decimal, Percentage, etc.

## Runtime rules

1. Dynamic body formula columns are resolved per repeated row first.
2. The selected Parent / Document group defines the runtime row set.
3. Summary rows evaluate top-to-bottom.
4. Aggregates see imported fields plus resolved formula-column labels/keys.
5. Named summary values become available to later summary formulas.
6. Invalid/unresolved summary formulas remain blank instead of crashing the builder.
7. Save/reload uses the existing table schema persistence path.

## Deferred

Pagination behavior for summary rows, repeating table headers across generated pages, and PDF/DOCX renderer parity remain DB-4.4 / DB-4.5 scope.


## Fix1 — Summary Row Full Cell Grid
A newly added summary row is created with the same base cell count as `table.columns.length`. Summary layout is customized through cell `colSpan` / `rowSpan`; there is no separate cell-add action. The final cell remains the default aggregate result cell.
