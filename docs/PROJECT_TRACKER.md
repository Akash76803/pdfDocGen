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

### DB-4.3A Fix1 — Formula Value Type Selection
- Status: Implemented / QA pending
- Fix: Dynamic Table column inspector now exposes Body value type = Field binding / Formula / Custom value.
- Formula setup no longer requires first locating/selecting the body-template cell; selecting either header or body cell for a column exposes the same column-level formula controls.
- Header cells remain labels and show guidance instead of making Formula look unavailable without explanation.
- Formula result Data Type/format remains independently editable.

### DB-4.3A Fix2 — Formula field references and percentage arithmetic
- Fixed blank formula output when imported numeric field names contain spaces.
- Added bracket field-reference syntax and automatic safe field-chip insertion.
- Percentage mapped columns now contribute fraction values to arithmetic according to Fraction/Whole input mode.
- Example verified target: `Basic Value - (Basic Value * (TD + Special Product Discount))`.
- Manual QA pending.

## DB-4.3A Fix3 — Formula Field Dropdown
- Status: Implemented / QA pending
- Purpose: Remove crowded formula field chips and expose the complete imported schema during formula authoring.
- Scope: Single field dropdown; all source fields; detected type labels; safe bracket reference insertion; Dynamic + cell-level formula editors.
- Testing: TypeScript TSX transpile check PASS; manual UI QA pending.
- Next: Validate DB4-T48, then continue DB-4.3A formula/data-type QA.

## DB-4.3A Fix4 — Formula-to-Formula Column References
- **Purpose:** Allow calculated columns to feed later calculated columns.
- **Scope:** Formula Columns optgroup in Insert field; safe `[Column Label]` references; per-row dependency evaluation; self/circular guard.
- **Status:** Implemented; manual QA pending.
- **Next:** Verify chained Net/Tax/Grand Total formulas, then continue DB-4.3A closeout / DB-4.3B summaries.


## DB-4.3A Fix5 — Date / Date Time / Time Formatting
DB4-T43 date/time QA fix: document date/time formatting now preserves literal source wall-clock values, supports common DD/MM/YYYY and ISO inputs, handles legacy Excel serial values, and avoids timezone day/time shifts. See `docs/DB4_3A_FIX5_DATE_TIME_FORMATTING.md`.

## DB-4P — Page Structure & Properties
Status: **Implemented / Manual QA Pending**

Implemented page presets/custom size, units, orientation, margins, bleed, safe area, appearance/guides, multi-page page ownership and page CRUD/reorder. Existing single-page local templates migrate to Page 1. New tables use current page content bounds. This phase is intentionally placed before DB-4.3B and DB-4.4 so summary and pagination work can depend on stable page geometry.

## DB-4P Fix1 — Direct Table Column Resize
Status: Implemented / QA Pending

- Direct drag-resize from table header column dividers.
- Adjacent column rebalances so table remains inside usable page width.
- Manual width hints persist through template save/reload.
- Column Structure: Fit Content / Equal Width / Reset Auto.
- Dynamic + Custom tables share the same behavior.

### DB-4.3B — Aggregations + Summary Rows
- Status: Implemented / QA Pending
- Added summary cell modes: Custom / Aggregate / Formula.
- Added SUM, COUNT, AVG, MIN, MAX over the active Parent / Document group.
- Aggregate source can be an imported field or Dynamic Table formula column.
- Added named summary chaining, e.g. Subtotal → Tax Amount → Grand Total.
- Existing DB-4.3A Data Type / formatting applies to summary outputs.
- Next QA: aggregation correctness, parent switching, chaining, formatting, persistence.


### DB-4.3B Fix1 — Summary Row Full Cell Grid
**Status:** Implemented / QA Pending

- New summary rows inherit the current table column count as their base cell grid.
- Default label is first cell; default aggregate result is last cell.
- Existing `colSpan` / `rowSpan` controls provide merge-style layout customization.
- No separate summary-cell insertion UI is required.

## DB-4.3B Final Verification
- **Status:** COMPLETED / VERIFIED.
- **Verified:** summary full-cell grid; SUM/COUNT/AVG/MIN/MAX; imported-field and formula-column aggregation; aggregate formulas; chained summaries; document-group recalculation; formatting; spans; persistence; invalid-formula safety.
- **Final baseline:** DB-4.3B Fix1 Summary Row Full Cell Grid.

## DB-5A — Editor History / Undo-Redo Foundation
- **Purpose:** Add one shared reversible edit history across the Template Builder.
- **Scope:** toolbar Undo/Redo; Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z; page/element/table/formula/format/binding history; direct column-resize history; single-step drag/resize gesture coalescing; redo invalidation after a new edit; bounded 100-entry history; fresh history after reload.
- **Status:** IMPLEMENTED / MANUAL QA PENDING.
- **Focused verification:** `TemplateBuilder.tsx` and `TableCanvas.tsx` TSX transpile/syntax check PASS. Full workspace typecheck remains blocked by pre-existing missing dependencies and stale build references in this extracted source environment.
- **Deliverable:** `Document-Builder-DB5A-Editor-History-Undo-Redo.zip`.
- **Next:** Manual DB5A-T01 through DB5A-T10 QA; then continue pagination/export hardening.

### DB-4.4 Phase 1 — Pagination + Multi-page Overflow — Implemented / QA Pending
- Dynamic table overflow planner uses page content height.
- Continuation preview fragments with repeated headers.
- Summary block keep-together behavior.
- Manual page-break-before row foundation.
- Pagination settings exposed in table Properties.
- Next: manual QA, then persistent continuation-page materialization / renderer parity.

### DB-4.4 Fix1 — Document ID Preview Picker — Implemented / QA Pending
- Dynamic Field preview now derives its label from the active Dynamic Table Parent / Document ID.
- Single key example: `Invoice No: INV-001`.
- Composite keys render as a readable combined identity.
- Duplicate flat-source rows for the same parent/document key collapse into one document option.
- Existing `activeRecordIndex` compatibility is preserved by selecting the first row of the chosen document group.
- Fallback remains `Record #N` when no document key is configured.

## DB-4.4 Phase 2 — Virtual Multi-Page Sheet Preview
- Status: Implemented / QA pending
- Purpose: Render Phase 1 table overflow as proper full document sheets instead of one long stacked table canvas.
- Scope: full virtual page surfaces, continuation at top usable margin, distinct first/continuation capacities, repeat-header compatibility, summary keep-together compatibility, page-size/margin integration, builder-only continuation labels.
- Persistence boundary: continuation sheets are derived preview pages, not persistent BuilderPage records yet.
- Next: manual QA, then DB-4.4 page-plan hardening / persistent continuation strategy before DB-4.5 renderer parity.

## DB-4.4 Phase 2 Fix1 — Overflow Page Navigator
- Automatic continuation pages are now represented in the Pages navigator with an Auto badge and canvas focus navigation.
- Derived continuation sheets remain non-persistent and cannot be independently reordered/deleted.
