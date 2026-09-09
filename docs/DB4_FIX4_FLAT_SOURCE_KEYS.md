# DB-4.1 Fix4 — Flat Source Parent / Row Keys

## Goal
Support business exports where one CSV/Excel/JSON source contains both parent/document fields and repeated line-item fields.

## Example
`InvoiceNo` is the Parent / Document ID. `LineItemNo` is the Child / Row ID. Selecting any record for `INV-001` produces one document context and repeats only the rows whose `InvoiceNo` is `INV-001`.

## Key configuration
- Data Source: one loaded DB-3 source.
- Parent / Document ID: one or more imported headers.
- Child / Row ID: zero, one, or more imported headers.
- Composite parent example: `CompanyCode + InvoiceNo`.
- Composite child example: `InvoiceNo + LineItemNo`.
- No row key selected: deterministic index fallback.

## Runtime behavior
1. Read the currently selected preview record.
2. Build its Parent / Document composite key.
3. Filter the same source to rows with the same parent key.
4. Build each repeated row identity from the configured Child / Row key fields.
5. Render the filtered rows through the Dynamic Table body template.

## Backward compatibility
Older Fix3 separate parent-source/child-foreign-key tables remain readable, but the creation UI no longer requires two data sources.

## Manual QA
- Single parent key: InvoiceNo.
- Single child key: LineItemNo.
- Composite parent key: CompanyCode + InvoiceNo.
- Composite child key: InvoiceNo + LineItemNo.
- Switch selected preview row between INV-001 and INV-002 and verify rows change immediately.
- Save/reload and verify key configuration persists.
