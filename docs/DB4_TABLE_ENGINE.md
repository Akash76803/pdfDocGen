# DB-4 — Dynamic + Custom Table Engine

## Purpose
Build one professional table model that supports both data-driven repeating line-item tables and fixed custom tables without creating two incompatible rendering engines.

## Frozen scope

### Shared table model
Every table has a stable table ID, name, columns, rows, cells, pagination settings and shared styling. Every column, design-time row and cell has its own stable ID. Runtime dynamic rows derive a stable row identity from `tableId + rowKey` with array index fallback.

### Dynamic Table
- Create through Table → Dynamic Table.
- Choose **Repeat Source** from Data Sources already imported in DB-3 (CSV / Excel / JSON). The table stores the selected source ID plus display name.
- Choose **Row Key** from the selected source's detected headers/fields. Stable keys such as `id`, `lineItemId`, `uuid`, `guid`, `sku` and product code are recommended when present; otherwise the user explicitly chooses a field or allows index fallback.
- Runtime rows repeat the entire selected Data Source record collection. Legacy nested-array repeat paths remain supported for older templates.
- Header rows and a repeatable body-row template.
- Custom rows after the repeating body for subtotal, tax, discount, grand total or remarks.
- Header repeat / row split policy is part of the schema for pagination work.
- Custom summary rows support the same rowSpan/colSpan cell model.

### Custom Table
- Create through Table → Custom Table.
- User chooses Columns and Rows, e.g. 5 × 8.
- Each cell is independently editable and independently bindable.
- No repeat source is required.

### Cell types
- Text
- Image
- QR Code
- Barcode

Image/QR/Barcode cells can be bound to imported fields. Image cells accept URL/data-image values during runtime preview.

### Cell spans
`rowSpan` and `colSpan` are schema-level properties for BOTH Dynamic and Custom tables. The editor exposes them for the selected cell.

### Properties
Table/row/column/cell models are intentionally separate:
- Table: id/name/mode/binding/pagination/default border/padding.
- Row: id/kind/height/autoHeight/repeat/keepTogether.
- Column: id/key/label/width/min/max/alignment.
- Cell: id/type/content/binding/formula/rowSpan/colSpan/style.

## DB-4 implementation sequence
1. **DB-4.1 Table Foundation** — schema, creation popup, Dynamic/Custom choice, fixed rows/cols, **loaded Data Source picker + Row Key header picker**, dynamic source-record repetition, cell selection, basic cell types, rowSpan/colSpan, dynamic custom total row.
2. **DB-4.2 Table Structure Editor** — add/delete/reorder rows/columns, column inspector, row inspector, safe span merge/unmerge validation.
3. **DB-4.3 Dynamic Binding & Formula Rows** — field picker for body/header cells, formula columns/cells, subtotal/tax/grand total expressions. (Row Key selection moved into DB-4.1 Fix1.)
4. **DB-4.4 Pagination** — auto-height, page measurement, repeat headers, keep row together, split policy, final-page summary rows.
5. **DB-4.5 Renderer Parity** — PDF first, then DOCX table mapping and regression.

## Current implementation — DB-4.1 started
Implemented in the current source package:
- Table click opens a Create Table modal.
- Dynamic / Custom mode selection.
- Custom row + column counts.
- Dynamic Repeat Source dropdown populated from DB-3 Data Sources + Row Key dropdown populated from selected-source headers/fields + column count + header-row count.
- Shared table schema with stable IDs.
- Dynamic body-row rendering from array data when available.
- Custom table fixed-grid rendering.
- Selected-cell inspector with Text/Image/QR/Barcode type, content, binding, rowSpan, colSpan, padding, font size, alignment and background.
- Dynamic custom total/summary row action with initial merged total label.
- Header repeat, selected `sourceId`, Repeat Source display name and chosen Row Key are stored in schema.

## DB-4.1 Fix1 — Dynamic Repeat Source + Row Key Picker
- Repeat Source is a dropdown of loaded DB-3 Data Sources instead of a hardcoded/free-text `items` value.
- Row Key is a dropdown of the selected source's detected fields/headers.
- Recognized stable identifiers are recommended automatically; arbitrary first-column guessing is avoided.
- Dynamic runtime rows use the selected Data Source's complete `records` collection.
- Switching Repeat Source in the table inspector refreshes Row Key choices and recommends a stable key for the new source.
- Existing legacy templates without `sourceId` retain nested-array-path behavior for backwards compatibility.

## Still pending inside DB-4
- Add/delete/reorder rows and columns.
- Explicit row and column inspector controls.
- Safe merge/unmerge command and span collision validation.
- Formula execution for total rows.
- Field-picker UX inside table cells.
- Dynamic grouped rowSpan calculations.
- Full pagination and renderer parity.
- Automated/manual DB-4 acceptance matrix.

## DB-4.1 Fix3 — Parent / Child Document Context

Dynamic tables can now be filtered by the currently selected parent document record.

Example:

- Parent source: Invoice
- Parent key: Invoice.Id
- Repeat source: Invoice Line Items
- Child foreign key: InvoiceLine.InvoiceId
- Row key: InvoiceLine.Id

When the preview record is `INV-001`, the table repeats only child rows whose `InvoiceId` equals the selected parent's `Id`. `rowKey` remains responsible only for stable identity of each repeated child row.

The relationship configuration is optional. Existing flat dynamic tables continue to repeat the selected source without parent filtering.


## DB-4.1 Fix4 — Flat Source Parent / Document ID + Child / Row ID

The primary Dynamic Table model now assumes parent/header and child/line-item fields may live in one flat imported source.

Example source:

```text
InvoiceNo | LineItemNo | Customer | Product | Qty | Rate
INV-001   | 10         | ABC      | A       | 2   | 500
INV-001   | 20         | ABC      | B       | 1   | 300
INV-002   | 10         | XYZ      | X       | 5   | 200
```

Configuration:
- Data Source: the imported sheet/file.
- Parent / Document ID: `InvoiceNo` (or a composite such as `CompanyCode + InvoiceNo`).
- Child / Row ID: `LineItemNo` (or a composite such as `InvoiceNo + LineItemNo`).

When a preview record belonging to `INV-001` is selected, the Dynamic Table filters the same source to all rows with the same Parent / Document ID and renders only those rows. Header fields resolve from the selected record. The Child / Row ID affects runtime row identity, not parent filtering.

### Composite keys
Both Parent and Row IDs accept multiple fields. Runtime identity is constructed deterministically from the selected field values. If the Row ID is empty, the renderer falls back to the row index.

### Backward compatibility
The earlier DB-4.1 Fix3 fields (`parentSourceId`, `childForeignKey`) remain supported for previously saved templates, but new table creation uses the same-source model by default.

## Type-aware cell content (DB-4.1 Fix5)
Table cells share one schema but expose type-specific editors. Text uses content/binding; Image uses binding/local asset/URL/fit; QR and Barcode use custom value/binding. rowSpan and colSpan apply equally to every cell type.

## Image cell fit
Table image cells default to Cover so media fills the complete cell/merged-cell frame. Contain and Stretch remain supported.
