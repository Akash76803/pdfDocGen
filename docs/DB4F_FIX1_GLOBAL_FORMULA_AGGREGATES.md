# DB-4F Fix1 — Global Formula Aggregate Functions

## Scope
Global Formula Fields now support aggregate functions over imported source rows:

- `SUM([Field])`
- `COUNT([Field])`
- `COUNT()` — count all rows in the current formula scope
- `AVG([Field])`
- `MIN([Field])`
- `MAX([Field])`

Aggregates can be mixed with the existing arithmetic operators and reusable Formula Fields.

Examples:

- `SUM([Taxable])`
- `SUM([CGST]) + SUM([SGST]) + SUM([IGST])`
- `AVG([Rate])`
- `MAX([Amount]) - MIN([Amount])`
- `SUM([Taxable]) + [TotalGST]`

## Document scope
When the active template contains a Dynamic Table with Parent / Document ID keys for the active source, aggregate functions operate only on source rows matching the currently previewed document identity. This prevents values from different invoices/documents from mixing.

If no Parent / Document ID is configured, aggregate functions operate over all rows in the active source.

## UX
The Formula Field inspector now has **Insert aggregate** controls:

1. Choose `SUM / COUNT / AVG / MIN / MAX`.
2. Choose an imported source field.
3. The expression is inserted using the safe field-reference syntax, for example `SUM([Taxable Value])`.

## Compatibility
- Existing arithmetic Formula Fields remain unchanged.
- Existing chained Formula Fields remain supported.
- Dynamic Field reuse (`{{FormulaName}}`) remains unchanged.
- Formula definitions remain non-printing and do not consume Body Flow space.
