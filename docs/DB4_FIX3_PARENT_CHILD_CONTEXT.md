# DB-4.1 Fix3 — Parent / Child Document Context

## Goal
A business document is generated in the context of one selected parent record. Example: selecting Invoice `INV-001` must display the Invoice header data and only the Invoice Line Items belonging to `INV-001`.

## Dynamic Table relationship
The Dynamic Table schema now supports:

- `sourceId`: child/repeating Data Source
- `rowKey`: unique identity of each child row
- `parentSourceId`: parent document Data Source
- `parentKey`: unique/key field on the parent record
- `childForeignKey`: field on the child source that references the parent

## Example
Parent source: `Invoice`
Parent key: `Id`
Child source: `Invoice Line Items`
Child foreign key: `InvoiceId`
Child row key: `LineItemId`

Selected parent record:
`Invoice.Id = INV-001`

Runtime filter:
`InvoiceLine.InvoiceId == INV-001`

Only matching line items repeat in the table.

## UI
Dynamic Table Create/Edit includes optional `Filter rows by selected parent record` configuration with Parent Source, Parent Key, and Child Foreign Key dropdowns populated from loaded DB-3 Data Sources and detected fields.

## Compatibility
Relationship filtering is optional. Existing flat dynamic-table behavior remains unchanged when relationship fields are not configured.
