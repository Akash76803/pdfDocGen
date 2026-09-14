# DB-5B — Single Document Generation Engine

## Goal

Turn the existing Template Builder render pipeline into an end-user generation workflow without duplicating formula, Body Flow, pagination, PDF, or DOCX logic.

## Workflow

1. Open **Generate**.
2. Use the currently saved template.
3. Select the imported Data Source used by the template.
4. Select one Parent / Document ID (or one record when no parent key is configured).
5. Choose **PDF**, **DOCX Exact**, or **DOCX Editable**.
6. Configure a dynamic filename rule such as `{{InvoiceNo}}_{{Customer Name}}`.
7. Run pre-generation validation.
8. Click **Generate Document**.
9. The app opens the saved Builder render context, applies the selected document record, reuses the existing materialized Preview pipeline, generates the chosen format, records the result, and returns to Generate.

## Architecture rule

DB-5B does not introduce another formula/pagination/renderer implementation. Generation delegates to the already implemented and tested Builder exports:

- DB-4F Formula Fields / aggregates
- DB-4.6 Number / Amount to Words
- DB-4B Body Flow
- DB-4.4 pagination/materialization
- DB-4.5A physical output page manifest
- DB-4.5B exact PDF
- DB-4.5C DOCX Exact
- DB-4.5C v2 DOCX Editable

## Data/document selection

When a Dynamic Table uses Parent / Document keys, flat line-item rows are collapsed into one document option. Selecting a document sets the same active-record metadata used by Template Builder, so header data, line items, grouped summaries, formulas, and amount-in-words resolve in one document context.

Without configured Parent / Document keys, Generate falls back to Record #N selection.

## Dynamic filename rules

Supported filename tokens include imported fields plus:

- `{{Document}}`
- `{{DocumentId}}`
- `{{Record}}`
- `{{Template}}`
- `{{TemplateName}}`

Windows-invalid filename characters are replaced safely before download.

## Validation

The Generate screen blocks generation when:

- there is no saved template,
- no data source is selected,
- no record/document is selected,
- no format is selected,
- the resolved filename is empty,
- the selected source does not match a source referenced by the saved template.

## Generation history

The latest 50 single-document runs are stored locally with:

- document label,
- output format,
- filename,
- success/failure status,
- completion time,
- error text when available.

## Non-regression

PDF, DOCX Exact, and DOCX Editable toolbar exports remain available in Template Builder. DB-5B calls those same paths with a generated filename override; it does not replace their renderer logic.
