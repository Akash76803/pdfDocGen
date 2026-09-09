# Document Builder Phase Tracker

| Phase | Purpose | Scope | Status | Testing | Deliverable | Next |
|---|---|---|---|---|---|---|
| DB-0 | Source extraction | Reusable engines + selected desktop/template source from docGen | Complete | Extraction verified | DB-0 repo ZIP | DB-1 |
| DB-1 | Standalone shell | Clean document-only routes, A4 builder shell, CAD separation, workspace cleanup | Implemented | See verification section in DB1_STANDALONE_SHELL.md | DB-1 standalone ZIP | DB-2 editor wiring |
| DB-2 | Template editing | Core document elements, selection/transforms, properties, save/load | Completed / Core Verified | Manual one-by-one QA passed; Dynamic Field deferred | DB-2 Fix1 | DB-3 data binding |

## DB-2 — Core Template Builder
- Purpose: Make the template canvas interactive and prioritize canvas workspace.
- Scope: Larger/collapsible workspace, element add/select/move/resize, basic inspector, local save/load.
- Status: COMPLETED / CORE VERIFIED.
- Testing: Manual one-by-one QA PASS for core DB-2 scenarios. Environment build verification still requires Node 20 + installed dependencies.
- Deliverable: Document-Builder-DB2-Fix1-Text-Alignment.zip
- Deferred: data-source binding moved to DB-3; actual image upload and expanded basic shape library remain enhancements.
- Next: DB-3 Dynamic Data Binding.


- DB-2 Fix1: Text alignment (Left/Center/Right) wiring corrected and user retest PASS.

## DB-3 — Data Source Import & Dynamic Field Binding
- Purpose: connect real Excel/CSV/JSON data to document elements.
- Scope: file import, normalization, field/type discovery, data preview, active record selector, Dynamic Field dropdown, live Text/QR/Barcode/Signature/Image binding preview.
- Implementation: COMPLETE.
- Testing: COMPLETED / MANUALLY VERIFIED. All DB-3 scenarios passed user QA.
- Deliverable: DB-3 Dynamic Data Binding source ZIP.
- Known limits: repeating arrays/tables deferred to DB-4; generation parity later; Excel currently uses detected/default visible sheet.
- Next planned phase: DB-4 Dynamic + Custom Table Engine.

### DB-3 Fix1 — IndexedDB Data Source Persistence
- **Purpose:** Remove localStorage quota failures during CSV/Excel/JSON import.
- **Scope:** Persist imported source records in IndexedDB; retain only active source/record metadata in localStorage; hydrate Data Sources and Template Builder asynchronously; migrate legacy DB-3 payload where possible.
- **Implementation:** Complete.
- **Testing:** DB3-T01 requires retest with the previously failing CSV; remaining DB-3 scenarios pending.
- **Known limitation:** Full Node 20 dependency/build verification must be run in the user's development environment if dependencies are not already installed.
- **Next:** Resume DB3-T01 one-by-one manual QA.

## DB-3 Fix2 — Image & Signature Media Elements
- **Purpose:** Replace generic Image/Signature content placeholders with real image-backed behavior.
- **Scope:** Local upload, replace/remove, URL/data-URL, contain/cover/stretch, actual canvas rendering, dynamic-field override, IndexedDB asset persistence.
- **Status:** Implemented; manual QA pending.
- **Testing:** Retest DB3-T09 Signature image binding and DB3-T10 Image binding plus local upload/reload.
- **Deliverable:** `Document-Builder-DB3-Fix2-Image-Signature.zip`
- **Next:** Continue DB-3 one-by-one testing after Fix2 retest.

## DB-3 Fix3 — Record Selector Sync
- **Purpose:** Fix DB3-T05 Record 1/2/3 preview and Template Builder synchronization.
- **Scope:** lightweight active-record persistence, shared event sync, selected-record detail/highlight, selection-aware preview window.
- **Status:** Implemented; manual retest pending.
- **Testing:** DB3-T05 RETEST.
- **Deliverable:** `Document-Builder-DB3-Fix3-Record-Selector-Sync.zip`.
- **Next:** Continue DB-3 one-by-one tests after T05 passes.

## DB-3 Fix4 — Lazy Record Picker
- **Purpose:** Reduce UI/DOM load for large imported data sources.
- **Scope:** Shared 50-record incremental picker in Data Sources and Template Builder; next 50 append on scroll; selected record and Fix3 synchronization preserved.
- **Status:** Implemented; manual retest pending.
- **Testing:** Test >150 records, scrolling batches, cross-page selection sync, reload retention, and small-source regression.
- **Deliverable:** `Document-Builder-DB3-Fix4-Lazy-Record-Picker.zip`.
- **Next:** Retest DB3-T05 plus large-record performance, then continue DB-3 field-binding QA.


## DB-3 Final Verification
- **Status:** COMPLETED / VERIFIED.
- **Manual QA:** PASS for CSV, Excel, JSON, nested fields, source switch/delete, record selector sync, Text/QR/Barcode binding, Image/Signature binding, binding persistence, DB-2 regression and 50-record lazy loading.
- **Final DB-3 baseline:** Fix4 Lazy Record Picker.

## DB-4 — Dynamic + Custom Table Engine
- **Purpose:** Professional business-document tables for invoices, quotations, POs, reports and fixed forms.
- **Frozen scope:** One shared table schema supporting Dynamic and Custom tables; stable table/row/column/cell IDs; Text/Image/QR/Barcode cell types; cell-wise binding; rowSpan + colSpan in both modes; Dynamic repeat source/body template; Dynamic custom summary/total rows; row/column/cell/table properties; pagination architecture.
- **Status:** DB-4.1 FIX1 IMPLEMENTED / MANUAL QA PENDING.
- **Implemented in DB-4.1:** Table creation modal, Dynamic/Custom selection, manual rows/columns, table schema, runtime dynamic row rendering, custom fixed-grid rendering, selected-cell properties, rowSpan/colSpan controls, custom total-row action. **Fix1:** Repeat Source now selects a loaded DB-3 Data Source and Row Key selects one of that source's detected headers/fields; source ID + row key are persisted and runtime rows use the selected source records.
- **Pending:** row/column CRUD/reorder, explicit row/column inspectors, merge validation, formulas, field-picker UX inside cells, pagination, PDF/DOCX renderer parity.
- **Deliverable:** `Document-Builder-DB4-Phase1-Fix1-Repeat-Source-Row-Key.zip`.
- **Next:** Retest DB4-T01/T03/T04 with loaded CSV/Excel/JSON sources and Row Key selection, then continue remaining DB-4.1 acceptance tests before DB-4.2.

### DB-4.1 Fix2 — Create Table modal responsive layout
- Status: Implemented; manual retest pending.
- Fixed overflow caused by long loaded Data Source names.
- Repeat Source / Row Key fields now use bounded responsive columns.
- Columns / Header Rows and footer actions remain within modal bounds.
- No table schema or DB-3 binding behavior changed.

### DB-4.1 Fix3 — Parent / Child Document Context
- Status: Implemented, manual QA pending.
- Purpose: Ensure one document/page uses one selected parent record and only its related dynamic-table child rows.
- Added optional Dynamic Table relationship fields: Parent Source, Parent Key, Child Foreign Key.
- Row Key remains independent and identifies each child line item.
- Runtime filtering: childForeignKey == selected parent record[parentKey].
- Typical flow: Invoice -> Invoice Line Items, Order -> Order Lines, Quotation -> Quotation Lines.
- Backward compatibility: relationship filtering is optional; existing flat dynamic tables remain supported.


### DB-4.1 Fix4 — Same-Source Parent / Row Identity
- **Purpose:** Match the real invoice/quotation export model where parent fields and line-item fields are present in one flat CSV/Excel/JSON source.
- **Scope:** Dynamic Table Data Source selector; Parent / Document ID from imported headers; Child / Row ID from imported headers; single-field or composite keys; runtime grouping by selected parent record; stable child-row identity; index fallback when no row key is selected.
- **Status:** Implemented; manual QA pending.
- **Compatibility:** DB-4.1 Fix3 separate-source relationship fields remain readable for older templates but are no longer the primary creation flow.
- **Example:** `InvoiceNo` groups one PDF/document; `LineItemNo` identifies each line item. Composite examples: `CompanyCode + InvoiceNo`, `InvoiceNo + LineItemNo`.
- **Deliverable:** `Document-Builder-DB4-Phase1-Fix4-Flat-Source-Keys.zip`.
- **Next:** Retest same-source invoice grouping before DB-4.2 column/row configuration work.

## DB-4.1 Fix5 — Type-aware Table Cell Media
**Status:** Implemented / manual QA pending

**Purpose:** Replace the generic table-cell Content editor with controls appropriate to Text, Image, QR, and Barcode cells.

**Scope:**
- Text: content + field binding.
- Image: field binding + local file + URL/data URL + fit.
- QR/Barcode: custom value + field binding.
- Custom-table field binding uses the active imported Data Source record.
- Dynamic-table field binding remains row-relative.
- Image assets use IndexedDB; only IDs are persisted in the template schema.

**Testing:** Manual QA pending.
**Next:** Close DB-4.1 foundation tests, then DB-4.2 row/column structure editor.

### DB-4.1 Fix6 — Table Cell Image Cover
- Status: Implemented / manual QA pending.
- Table image cells default to Cover and fill the full cell or merged rowSpan/colSpan area.
- Contain/Stretch remain available; image media padding is removed.

## DB-4.2 — Row / Column Structure Editor
- **Purpose:** Allow table structure changes after creation while preserving stable schema identities and DB-4.1 behavior.
- **Scope:** Custom row add/delete/duplicate/reorder; Custom + Dynamic column add/delete/duplicate/reorder; Dynamic header/custom-row editing; row inspector; column inspector; span-aware column insert/delete; merged-column reorder guard; save/reload compatibility.
- **Status:** IMPLEMENTED / MANUAL QA PENDING.
- **Testing:** Focused structure harness PASS. Full workspace typecheck requires installed dependencies under Node 20.
- **Deliverable:** `Document-Builder-DB4-Phase2-Row-Column-Structure-Editor.zip`.
- **Next:** One-by-one DB-4.2 manual QA, then DB-4.3 formula columns and totals.

### DB-4.2 Fix1 - Structure action selection wiring
- Status: Implemented / manual retest pending.
- Fixed table-cell pointer-selection wiring: clicked cell now synchronizes parent Table selection + `selectedCellId`.
- Target regression: DB4-T23 Add Row Above/Below and downstream DB4-T24..T32 structure actions.

### DB-4.2 Fix2 — Properties Inspector UI cleanup
- Status: Implemented / manual QA pending.
- Row Structure, Column Structure, and Selected Cell are visually grouped into dedicated cards.
- Long technical IDs are collapsed by default.
- Row/column actions use compact symbol buttons with consistent spacing and separate destructive styling.

### DB-4.2 Fix3 — Dynamic Table Field Mapping
- Status: Implemented / QA pending
- Removed manual runtime-row concept from Dynamic Table creation.
- Dynamic Table uses one header row + one data-driven body template.
- Added per-column Header Label + Repeat Row Field mapping from imported Data Source fields.
- Custom Table retains manual Rows × Columns.
- Next QA: verify mapped labels/bindings, parent-group switching, save/reload, and DB-4.1/4.2 regression.

## DB-4.2 Fix4 — Table Auto-Fit to Page
- Status: Implemented / QA Pending
- Dynamic and Custom table columns normalize to 100% of the table element width.
- New tables start at page usable width with a 30 px inset on each side.
- Horizontal table scrolling removed; cell content wraps.
- Existing tables are backward-compatible because stored widths are interpreted as relative weights at render time.


## DB-4.2 Fix5 — Natural Height + Smart Column Sizing
**Status:** Implemented / manual QA pending. Removed internal vertical table scrolling; table element height follows rendered content. Added content-aware column width distribution while retaining 100% page-fit and manual width influence. Tests: DB4-T36/T37.

## DB-4.2 Final Verification
- **Status:** COMPLETED / VERIFIED.
- **Verified:** row/column structure editor; Dynamic field-mapping create flow; data-driven body rows; responsive Properties inspector; span-safe structure changes; page-width auto-fit; natural-height tables; smart content-aware column sizing; persistence/regression.
- **Final baseline:** DB-4.2 Fix5 Natural Height + Smart Columns.

## DB-4.3A — Formula + Data Type / Formatting Foundation
- **Purpose:** Start the calculation engine while adding reusable business-data display types.
- **Scope:** Custom/Binding/Formula value modes; row-level arithmetic formula evaluation; Text/Number/Decimal/Currency/Percentage/Date/Date Time/Time/Checkbox data types; type-aware display controls; column defaults + cell overrides; dynamic-source type suggestion; persistence through the existing template schema.
- **Status:** IMPLEMENTED / MANUAL QA PENDING.
- **Automated/focused verification:** TS/TSX syntax transpilation PASS; focused formula/format model harness PASS. Full workspace typecheck is blocked by missing React/lucide typings in the current source environment; Vitest executable is not installed.
- **Deliverable:** `Document-Builder-DB4-Phase3A-Formula-Data-Types.zip`.
- **Next:** Manual DB-4.3A QA, then DB-4.3B Aggregations + Summary Rows.
