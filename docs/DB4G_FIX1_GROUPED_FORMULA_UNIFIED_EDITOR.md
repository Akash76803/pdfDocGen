# DB-4G Fix1 — Grouped Formula Columns + Unified Create/Edit UI

## Purpose
Make Grouped Summary tables suitable for tax/HSN and other business summaries without requiring a precomputed source `Total` field, and make an existing grouped table configurable through the same UI used when it was created.

## Grouped calculation pipeline
1. Filter imported flat data to the active Parent / Document key.
2. Group matching rows by one or more Group By fields.
3. Resolve Group value and aggregate output columns (`SUM`, `COUNT`, `AVG`, `MIN`, `MAX`, `FIRST`, `LAST`).
4. Resolve Formula output columns from grouped output labels.
5. Apply existing table formatting and pagination.

Example:
- `HSN` → Group value
- `Taxable` → SUM(Taxable)
- `CGST` → SUM(CGST)
- `SGST` → SUM(SGST)
- `IGST` → SUM(IGST)
- `Total GST` → Formula `[CGST] + [SGST] + [IGST]`
- `Total` → Formula `[Taxable] + [Total GST]`

Formula columns support `+`, `-`, `*`, `/`, parentheses and `[Output Label]` references. Formula columns can chain. Self/circular/unresolved formulas remain blank/null rather than crashing the builder.

## Unified configuration editor
Grouped Summary Create and Edit use `TableCreateModal` as the same configuration surface. Selecting an existing Grouped Summary exposes **Edit Grouped Summary Configuration** in Properties. The editor is prefilled with:
- Data Source
- Parent / Document ID key(s)
- Group By key(s)
- Output labels
- Source fields
- Aggregate operations
- Formula expressions

Applying changes preserves the existing table ID and retains visual table settings such as column widths/alignment/formatting by column position, pagination configuration, borders and table-level styling where possible.

## QA focus
- HSN grouped formula totals are correct.
- Chained formula (`Total` using `Total GST`) resolves correctly.
- Circular/self reference remains blank safely.
- Edit opens with current configuration prefilled.
- Apply updates grouping/formulas without adding a second table.
- Existing manual column widths/formatting survive edit where matching columns remain.
- Save/reload preserves formulas and grouped configuration.
