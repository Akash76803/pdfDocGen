# Document Builder

Standalone PDF/DOCX business-document application extracted from `Akash76803/docGen`.

## Current phase

**DB-4 — Dynamic + Custom Table Engine (DB-4.2 Row / Column Structure Editor)**

The active desktop app is intentionally document-focused. The historical Card Designer, CAD and packaging source is preserved under `reference/` and is not part of the active build.

## Run locally

Use Node 20 as required by the workspace:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

For the Tauri desktop shell:

```bash
npm run tauri:dev
```

## Active navigation

- Dashboard
- Templates
- Template Builder
- Data Sources
- Generate
- Settings

See `docs/DB1_STANDALONE_SHELL.md` and `docs/PROJECT_TRACKER.md`.

## Current phase — DB-3
DB-2 Core Template Builder has been manually core-verified. DB-3 adds real CSV/Excel/JSON import, detected-field preview, active-record selection, Dynamic Field dropdown binding, and live bound-value preview in Template Builder. See `docs/DB3_DYNAMIC_DATA_BINDING.md` for scope and manual tests.

### DB-3 Fix1 — large CSV/Excel persistence
Imported data-source records are persisted in IndexedDB instead of storing the complete payload in `localStorage`. This avoids WebView/localStorage quota failures for larger CSV/Excel sources and Base64/data-URL values. Only small active-source/record metadata remains in localStorage.

## DB-3 Fix2 — Image & Signature
Image and Signature are now image-backed elements. Their Properties panel supports local upload, replace/remove, image URL/data URL and Contain/Cover/Stretch. Local assets are stored in IndexedDB so image bytes do not consume the template localStorage quota. Dynamic image/signature binding remains available through the Dynamic Field tab.

### DB-3 Fix3 — Record Selector Sync
DB3-T05 record selection now uses lightweight metadata persistence instead of rewriting the full IndexedDB dataset. Data Sources follows/highlights the selected record and Template Builder receives the same active record through the shared data event. See `docs/DB3_FIX3_RECORD_SELECTOR_SYNC.md`.

## DB-3 Fix4 — Lazy Record Selector (50-record batches)
Large data sources no longer render every record option at once. Both Data Sources and Template Builder now use a shared lazy record picker that initially renders 50 records and appends the next 50 when the picker is scrolled near the bottom. The selected record stays synchronized through the DB-3 Fix3 metadata-only selection flow. This reduces DOM work for large CSV/Excel imports while preserving record selection and binding preview behavior.


## DB-3 completion
DB-3 Dynamic Data Binding is manually verified complete: CSV/Excel/JSON import, field discovery, multiple source management, record selection sync, Text/QR/Barcode/Image/Signature binding, persistence, DB-2 regression, and 50-record lazy picker all passed user QA.

## DB-4 — Dynamic + Custom Table Engine
The table scope is now frozen. Table creation supports two modes: **Dynamic** (array-driven repeating line items) and **Custom** (manual rows × columns with cell-wise binding). Both share the same table/row/column/cell schema and both support `rowSpan` and `colSpan`. Dynamic tables additionally allow custom summary/total rows after the repeating body.

DB-4.1 development now includes **Fix1 for Dynamic Table source identity**. Repeat Source is no longer a free-text `items` field when creating/editing a new Dynamic Table: it is selected from the Data Sources already imported in DB-3. Row Key is selected from that source's detected headers/fields, with stable-key recommendations such as `id`, `lineItemId`, `uuid`, `guid`, `sku` or product code when present. The selected Data Source ID and Row Key are stored in the table schema, and runtime rows repeat the full selected source record collection. Legacy nested-array repeat paths remain readable for older templates.

The DB-4.1 baseline also contains the table schema, creation popup, fixed custom grids, selectable cells, Text/Image/QR/Barcode cell types, span controls, and an initial custom total-row action. See `docs/DB4_TABLE_ENGINE.md`.

### DB-4.1 Fix2 UI hotfix
Create Table modal layout was corrected for long Data Source names and smaller workspaces. Repeat Source / Row Key remain connected to DB-3 data, while field widths are now bounded and responsive so Columns, Header Rows, notes, and actions stay inside the modal.

### DB-4.1 Fix4 — Flat Source Parent + Row Keys
Dynamic Tables now support the primary business workflow where parent/header data and child/line-item data are in the **same imported sheet/source**. Choose a Parent / Document ID (for example `InvoiceNo`) to group the selected document and a Child / Row ID (for example `LineItemNo`) to identify each repeated row. Both identities can be composite keys built from multiple imported headers, such as `CompanyCode + InvoiceNo` and `InvoiceNo + LineItemNo`. The earlier separate Parent Source / Child Foreign Key model remains readable only for backward compatibility.

### DB-4.1 Fix5 — Type-aware custom table cell content
- Custom/Dynamic table cell editor no longer shows one generic Content control for every media type.
- Text cells: static content + Data Source field binding.
- Image cells: field binding, local image choose/replace/remove, URL/data URL, and Contain/Cover/Stretch fit. Local image bytes remain in IndexedDB; table schema stores only the asset ID.
- QR and Barcode cells: custom value + Data Source field binding. Binding overrides the custom value at preview/generation time.
- Custom-table bindings resolve against the currently active Data Source record; dynamic-table bindings resolve against each repeated row.
- rowSpan/colSpan and shared cell styling remain unchanged across all cell types.

### DB-4.1 Fix6 — Table Cell Image Cover
- Table Image cells now default to **Cover** so the image fills the complete cell/merged-cell area.
- Cover preserves aspect ratio and crops overflow; Contain and Stretch remain selectable.
- Image cells remove internal cell padding while rendering media so there is no unwanted white gutter.
- The image frame expands across rowSpan/colSpan merged regions and follows cell resize.

## DB-4.2 — Row / Column Structure Editor
DB-4.1 is manually verified complete. DB-4.2 adds post-creation structure editing to both table modes.

**Custom Table:** add row above/below, duplicate/delete/move rows, plus add/duplicate/delete/move columns.

**Dynamic Table:** body rows remain data-driven, while columns are fully structure-editable and header/custom summary rows can be edited. Column changes propagate to the dynamic body template without creating manual runtime rows.

The Properties panel now exposes Row Structure and Column Structure inspectors for the selected cell. Column insertion/deletion is `colSpan`-aware. Column reordering is disabled while merged `colSpan` cells exist to prevent silent structural corruption; split merged cells before reordering.

See `docs/DB4_2_ROW_COLUMN_STRUCTURE_EDITOR.md`.

### DB-4.2 Fix1 - Table cell selection wiring
- Fixed table-cell selection so it also selects the parent Table element.
- Row/Column Structure controls now activate for the clicked cell instead of depending on the table already being selected.
- DB4-T23 Row Above/Below requires manual retest.

### DB-4.2 Fix2
Table Properties UX cleanup: Row Structure, Column Structure, and Selected Cell now use compact inspector cards, hidden-by-default technical IDs, and symbol-based structure actions to reduce crowding in the right panel.

### DB-4.2 Fix3 — Dynamic Table Field Mapping
Dynamic Table creation no longer asks users to define runtime row counts. A dynamic table is created from one imported Data Source with one fixed header row and one body-template row. Users configure each table column using a **Header Label** plus a **Repeat Row Field** selected from imported headers. Runtime body rows are generated only from matching imported records. Custom Table keeps the manual Rows × Columns workflow.

### DB-4.2 Fix4 — Table Auto-Fit
Dynamic and Custom tables now normalize persisted column widths to the available table width, preventing horizontal canvas scrolling. New tables start at the usable page width, while long cell content wraps instead of pushing columns beyond the page.

### DB-4.2 Fix5 — Natural Height + Smart Column Sizing
Tables no longer create an internal vertical scrollbar. The canvas table grows to its rendered row content, while table height is read-only Auto and resizing changes width only. Column distribution is now content-aware, so compact fields such as Quantity use less space than long description fields while all columns still fit the available table/page width.

## DB-4.3A — Formula + Data Types
DB-4.2 is manually verified complete. DB-4.3 now starts with row-level formulas and type-aware business formatting.

For Text table cells, **Value Mode** can be Custom Value, Field Binding, or Formula. Formula mode supports row-relative arithmetic such as `Quantity * Rate - Discount` using `+ - * /` and parentheses.

The table Column inspector now includes **Data & Format** defaults, while the Selected Cell inspector can override them. Available data types are Text, Number, Decimal, Currency, Percentage, Date, Date Time, Time, and Checkbox/Boolean. Formatting controls change according to the selected type (decimals, currency symbol/code, percentage interpretation, date/time pattern, checkbox labels, etc.). Imported raw values are not rewritten; formatting is display-only.

Dynamic Table mapped columns also receive an initial suggested data type from the imported schema. Aggregations and configurable Subtotal/Tax/Grand Total rows continue in DB-4.3B.
