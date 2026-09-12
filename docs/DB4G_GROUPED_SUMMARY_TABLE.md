# DB-4G — Grouped Summary Table

**Status:** Implemented / manual QA pending  
**Date:** 2026-09-12

## Purpose
Create one summary row per distinct value (or composite key) from the imported flat Data Source, scoped to the currently selected Parent / Document, and aggregate numeric fields across all matching source rows.

Primary GST example:

`HSN | Total GST | Taxable | CGST | SGST | IGST | Total`

If HSN `73181500` occurs on multiple invoice line items, the Grouped Summary Table emits only one `73181500` row and SUMs the configured numeric columns.

## Creation flow
Template Builder → Add Table → **Grouped Summary**

1. Choose Data Source.
2. Choose Parent / Document ID (for example `InvoiceNo` or `CompanyCode + InvoiceNo`).
3. Choose Group By (for example `HSN`; composite keys are supported).
4. Add output columns.
5. For every output column choose:
   - Header label
   - Source field
   - Operation

Supported operations:
- Group value
- SUM
- COUNT
- AVG
- MIN
- MAX
- FIRST
- LAST

## Data-context rule
Grouping always happens **after** filtering the flat source to the active Parent / Document. Data from another invoice/order/document must never enter the current grouped summary.

Example source:

| InvoiceNo | HSN | Taxable |
| --- | --- | ---: |
| INV-001 | 73181500 | 10000 |
| INV-001 | 73181500 | 5000 |
| INV-002 | 73181500 | 8000 |

Previewing `INV-001` produces `73181500 → 15000`, not `23000`.

## Architecture
Grouped Summary Table intentionally reuses the proven Dynamic Table runtime/pagination path:

`Imported rows → Parent filter → Group By buckets → Aggregate output records → Dynamic Table renderer/pagination`

The generated aggregate output is represented as stable runtime rows, so existing features continue to apply:
- column formatting / data types
- auto-height
- DB-4B Body Flow
- DB-4.4 pagination + Footer hard boundary
- repeat table header
- column resize
- save/reload persistence

## Acceptance examples
### HSN GST summary
Configuration:
- HSN → Group value
- Taxable → SUM
- CGST → SUM
- SGST → SUM
- IGST → SUM
- Total GST → SUM
- Total → SUM

Input:
- 73181500: Taxable 10000 + 5000
- 73201020: Taxable 8000

Expected output:
- 73181500: Taxable 15000
- 73201020: Taxable 8000

## Compatibility
No existing Dynamic Table or Custom Table schema is replaced. Grouped Summary is stored as Dynamic Table-compatible configuration with additional `binding.grouping` metadata, so existing templates remain unaffected.
