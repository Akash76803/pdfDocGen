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


## DB-4H — Header / Footer Zones — IMPLEMENTED / QA PENDING
Introduces dedicated Header/Footer bands before DB-4.4 Phase 3. Pagination content bounds now reserve header/footer height + gaps; repeated band elements and `{{pageNumber}}` / `{{totalPages}}` tokens are supported.

### DB-4H Fix1 — Header/Footer repeat + region assignment
Status: Implemented / Retest required.
Manual QA reported DB4H-T04, T05 and T06 failing. Fix1 makes Header/Footer zone assignment explicit and self-contained: selecting a zone auto-enables it, places/fits the element within the band, constrains band drag/resize, and surfaces the zone repeat mode in the selected-element Properties card. T04/T05/T06 require retest.

### DB-4H Fix2 — Header/Footer Content Containers
Status: Implemented / QA pending
- Header/Footer upgraded to reusable content containers.
- Elements panel can insert directly into Body/Header/Footer.
- All Header/Footer child elements repeat with the region repeat rule.
- Region children preserve content properties/dynamic bindings and are constrained/reflowed inside the band.
- Repeated continuation copies are read-only projections.
- Tables remain Body-only.

## DB-4H Fix3 — Global Header / Footer Master
**Status:** Implemented / QA pending

Header/Footer were promoted from page-local continuation behavior to document-level master regions. Dedicated Header/Footer inspector tabs control global enable/height/gap/repeat settings. Master content projects to all manual Builder Pages and overflow continuation pages; repeat policies are evaluated against the complete output page sequence. Page-number tokens use global output page numbering. Manual QA is pending before DB-4H closure.

## DB-4H Fix4 — Global Master Positioning + Mixed Static/Dynamic Content
**Status:** Implemented / QA pending

- Global Header/Footer projections are editable from any page, but still update one shared master rather than creating independent copies.
- Added quick zone placement: Left / Center / Right and Top / Middle / Bottom.
- Added shared `{{FieldName}}` token resolution for static + dynamic text composition.
- Added field-token insertion UI to document elements and custom table/summary text content.
- `{{pageNumber}}` / `{{totalPages}}` remain supported in the same template syntax.
- Shape text now renders when content is supplied.
- Full workspace typecheck remains blocked by missing extracted-environment dependencies; focused TS/TSX transpile checks pass.
- Next: manual QA of master positioning and mixed-token behavior, then close DB-4H before DB-4.4 Phase 3.

## DB-4H Fix5 — Multi-token Visibility + Content Typography

- Fixed unresolved multi-field mixed content, including imported field names with pre-existing braces.
- Added live resolved preview and stable caret behavior for repeated field insertion.
- Added shared element typography: family, size, bold, italic, underline, line height, color and alignment.
- Typography applies to both static and dynamic portions of the same content block.

## DB-4H Fix6 — Body Positioning + Smart Placement
**Status:** Implemented / QA pending

Added Body alignment controls (Left/Center/Right + Top/Middle/Bottom), Header/Footer-aware Body bounds, collision-aware Smart Insert for new content, table free-slot insertion, and Body drag/resize boundary protection. Manual overlap remains available after insertion.

## DB-4H Fix7 — Manual Overlap + Layering
Implemented explicit z-order controls for Body/Header/Footer elements. Smart Insert avoids accidental overlap only during creation; manual overlap is allowed. Selected elements remain interactable above overlapping content while editing, and users can persist desired stacking with Bring Front/Forward/Backward/Send Back.

## DB-4B — Body Flow / Reflow Layout Engine
**Status:** Implemented / QA pending

- New Body content defaults to Flow Block rather than absolute placement.
- Flow blocks stack top-to-bottom inside Header/Footer-aware content bounds.
- Dynamic/custom table height changes push every later Flow Block down automatically.
- Flow controls: Gap Before/After (mm), Left/Center/Right alignment, Full/Custom width, Move Up/Down.
- Floating mode preserves X/Y placement, layering and intentional overlap.
- Dragging a Flow Block converts it to Floating for explicit free placement.
- Existing templates migrate as Floating to avoid layout regressions.
- Next: manual DB4B QA, then DB-4.4 Phase 3 uses the same measured flow stack for cross-page block materialization.

## DB-4B Row/Block Flow Engine — Authoritative Body Layout (2026-09-11)

Status: **Implemented / manual QA pending**.

This scope supersedes today's experimental Body placement patches (DB-4H Fix6/Fix7/Fix8) and the initial DB-4B single-stack flow semantics. Body now defaults to deterministic top-to-bottom Row/Block Flow: first block at usable Body top, each new block in a new 100%-width row, auto-height Rich Text/Table reflow, Move Up/Down, percentage widths, multiple blocks per horizontal row, tallest-block row height, row alignment/gaps and an explicit Floating escape hatch. Existing absolute templates remain safe as Floating; experimental flow blocks without row ids normalize to independent rows. Next: verify DB4B-RF01..RF13, then DB-4.4 Phase 3 pagination/flow materialization.

## DB-4.4 Phase 3 — Pagination Hardening / Materialization (2026-09-11)
**Status:** Implemented / manual QA pending.

- Reworked dynamic-table pagination to reduce premature page breaks and the large blank gap reported above the Footer.
- Auto-height rows now use a typography/padding-based rendered-height estimate instead of the old fixed 30/32px design handle height.
- Page 1 consumes only the remaining Header/Footer-aware body space from the table's rendered Y; continuation pages use full body height.
- Materialized page plan now includes stable page identity, exact runtime row ranges, header/summary flags and available/used/unused height.
- Repeat-header and keep-summary-together rules are centralized in the planner.
- Runtime rows are never silently dropped; oversized-row planning avoids empty-page loops.
- Manual body-break behavior no longer creates a break before every repeated runtime record.
- Dedicated regression focus: minimize unused first-page body space before a continuation page while preserving Footer clearance.
- Next: manual DB44-P3 QA on real invoice data, then extend the same materialized page plan to arbitrary DB-4B flow rows/blocks and DB-4.5 PDF/DOCX parity.

## 2026-09-11 — DB-4.4 Phase 3 Fix2: Cross-page Body Flow Materialization
- Fixed Body Flow elements being placed after a Dynamic Table's first-page fragment instead of after its complete paginated output.
- Added output-page-aware flow materialization; downstream blocks now start after the final table fragment.
- Footer remains a hard boundary: if the following block cannot fit, it moves to the next output page Body start.
- Virtual page count now includes downstream Flow content after paginated tables.
- QA: DB44-P3-T11 and DB44-P3-T12 pending manual verification.

## DB-4G — Grouped Summary Table (2026-09-12)
**Status:** Implemented / manual QA pending.

- Added a third Create Table workflow: **Grouped Summary**.
- Grouping is performed on the imported flat Data Source after filtering to the selected Parent / Document.
- Supports single/composite Group By keys.
- Output columns support Group value, SUM, COUNT, AVG, MIN, MAX, FIRST and LAST.
- Primary target scenario: HSN-wise GST summary (`HSN | Total GST | Taxable | CGST | SGST | IGST | Total`).
- Reuses Dynamic Table rendering/pagination/Body Flow so grouped rows receive existing formatting, auto-height, repeat-header and continuation-page behavior.
- Focused runtime verification: HSN grouping and SUM aggregation PASS; modified TS/TSX syntax transpile PASS.
- Full workspace typecheck remains blocked by missing extracted-environment dependencies/stale build references.
- Next: manual DB4G-T01..T07 QA, then continue DB-4.4 Phase 3 closure.

## DB-4G Fix1 — Grouped Formula + Unified Table Editor (2026-09-12)
- Status: Implemented / manual QA pending.
- Added `FORMULA` as a Grouped Summary output operation.
- Formula evaluation happens after group/aggregate values and supports chained output references such as `[Taxable] + [Total GST]`.
- Self/circular or unresolved formulas safely remain blank.
- Existing Grouped Summary tables now expose **Edit Grouped Summary Configuration** and reopen the same configuration UI used during creation with existing values prefilled.
- Applying edits preserves table identity and visual column settings by position where possible.
- Focused runtime verification: PASS. Workspace-wide typecheck remains blocked by missing dependencies/stale build references in the provided source environment.

## DB-4G Fix2 — Grouped Final Summary Row (2026-09-12)
- Status: Implemented / manual QA pending.
- Added optional final total row to Grouped Summary create/edit UI.
- Per-column operations: Blank, Custom Text, SUM, COUNT, AVG, MIN, MAX, FORMULA.
- Final totals calculate over grouped output rows (not raw line items).
- Summary renders once on final page, Keep Summary Together, Footer hard boundary aware.
- Next: DB4G-F2-T01..T06 manual QA, then finish DB-4.4 Phase 3 stabilization.


## DB-UX Fix1 — Global Searchable Preview Document Picker (2026-09-13)
- Status: IMPLEMENTED / QA PENDING
- Moved Preview document/record selection from Dynamic Field inspector to the global top builder toolbar.
- Added searchable dropdown with lazy filtering; document labels continue to use single/composite Parent/Document ID values.
- Preview selection is shared across the entire builder and resets preview focus to output page 1.
- Dynamic Field inspector now contains binding/token controls only.

## DB-4G Fix3 — Grouped Summary Column Order (2026-09-13)
- Status: Implemented / manual QA pending.
- Added Move Left / Move Right controls to Grouped Summary output columns in the shared Create/Edit configuration UI.
- Reordering also moves the matching Final Summary Row configuration.
- Reconfigure now preserves visual column settings by logical grouped-column identity rather than raw array index, preventing widths/formatting from jumping to another column after edits.
- Added safe valid-column/summary alignment when incomplete draft mappings exist.

## DB-4.4 Phase 3 Fix5 — Dynamic Table Fragment Height / Hitbox (2026-09-13)
- Status: Implemented / manual QA pending.
- Fix: paginated Dynamic Table canvas wrapper now uses the current materialized fragment `usedHeightPx`, not the logical/persisted table height.
- Result: selecting a short continuation/final table fragment no longer creates a large white overlay that hides correctly-positioned blocks below it.
- Layout/flow positions are intentionally unchanged; this is a page-local visual hitbox/selection fix.

## DB-4.4 Phase 3 Fix6 — Table Height Update Loop Guard (2026-09-13)
- Fixed React `Maximum update depth exceeded` caused by table height measurement feeding persistent layout state on every render.
- `TableCanvas` now deduplicates DOM height publications across renders and decouples its measurement effect from callback identity.
- Paginated virtual Dynamic Table fragments no longer publish page-local height into the logical Builder element; pagination materialization remains the source of truth for fragment height.
- Fix5 continuation-page fragment hitbox behavior is preserved.
- Manual QA: paginated table selection, fragment visibility, single-page/custom table auto-height, pagination stability.

## DB-4F Fix1 — Global Formula Aggregate Functions (2026-09-13)
- Status: IMPLEMENTED / QA PENDING.
- Added SUM, COUNT, AVG, MIN and MAX to Global Formula Fields.
- Aggregate scope follows the active Parent / Document ID when configured; otherwise it uses all active-source rows.
- Added Formula inspector UI to insert aggregate calls safely using imported field names.
- Existing arithmetic/chained formulas and reusable Dynamic Field tokens remain compatible.


## DB-4F Fix2 — Single Formula Reference Selector (2026-09-13)
- Status: IMPLEMENTED / QA PENDING.
- Removed duplicate source-field dropdowns from Formula Properties.
- Added one shared Reference field selector used by both direct field insertion and aggregate insertion.
- Aggregate insertion remains limited to imported source fields; Formula Field references can still be inserted normally.


## DB-4F Fix3 — Unified Formula Binding Everywhere (2026-09-13)
- Status: IMPLEMENTED / QA PENDING.
- Global Formula Fields are now surfaced anywhere table content already supports Custom Content / Field Binding, including text, QR, barcode, image binding, custom summaries and table formula references.
- Table rendering resolves Formula Field bindings/tokens from the same document-level formula context used by regular builder elements.
- Preview Document changes therefore recalculate the same Formula Field consistently across regular elements and table cells.

## DB-4.5A — Materialized Render Model v1 (2026-09-13)
- Status: IMPLEMENTED / QA PENDING.
- Added one document-wide physical output page manifest based on the existing tested body-flow/table materializer.
- Preview and PDF share output page ordering and continuation identities; PDF does not independently paginate.

## DB-4.5B — Preview → PDF Exact Parity v1 (2026-09-13)
- Status: IMPLEMENTED / QA PENDING.
- Added exact-raster Preview-to-PDF export from the Template Builder top toolbar.
- Exports all Builder Pages + continuation pages in document order at physical page dimensions.
- Removes editor-only guides/selection chrome from captures; uses existing PDF writer for final file bytes.

## DB-4.5B Fix1 — Repeated Header/Footer Badge Export Cleanup (2026-09-13)
- Status: Implemented / QA pending.
- Removed the editor-only `Repeated` pseudo-element badge from exact Preview → PDF capture.
- Preview authoring badge remains visible inside the editor; PDF output no longer contains it.
- No pagination/layout behavior changed.


## DB-4.5B Fix2 — Table Border Style (2026-09-13)
- Status: IMPLEMENTED / QA PENDING
- Added table-wide border Style (Solid/Dashed/Dotted/Double/None), Width and Color controls.
- Applies to Custom, Dynamic and Grouped Summary tables, including continuation pages and Preview→PDF capture.
- Existing tables default to Solid for backward compatibility; grouped-summary reconfiguration preserves the style.

## DB-4.5B Fix3 — Repeated Badge Hard Removal (2026-09-13)
- Status: IMPLEMENTED / RETEST REQUIRED.
- Replaced CSS-only pseudo-element suppression with direct clone DOM cleanup for repeated Header/Footer projections.
- Export clone removes `.repeated-region-projection`, clears the repeated data marker, and keeps a defensive pseudo-element CSS guard.
- Live editor still shows the authoring badge; PDF must not.

## DB-4.5B Fix4 — Repeated Badge Pre-Capture Removal (2026-09-13)
- Fix3 clone-only cleanup was still too late on the user's Chromium/html2canvas path.
- Export now temporarily strips the repeated-authoring class/data marker from the live physical page before html2canvas reads computed/generated content, waits one animation frame, captures, then restores the original DOM markers in `finally`.
- No React state or document layout is changed. Editor-only `Repeated` badges should never enter PDF rasterization.

## DB-4.5B Fix5 — Custom Table Auto-Height / Body Reflow (2026-09-13)
- Status: Implemented / QA pending.
- Hardened Custom Table DOM height measurement using shell/table scrollHeight and ResizeObserver after paint.
- New/deleted rows update the logical table element height and therefore reflow all following Body Flow rows.
- Existing maximum-update-depth dedupe guard remains intact.


## DB-4B Fix2 — Shared Flow Row Tallest-Block Reflow (2026-09-13)
- Status: IMPLEMENTED / QA PENDING.
- Added explicit shared-row height synchronization for side-by-side Body Flow blocks.
- Row reservation is the tallest current member; shorter blocks keep their own visual heights.
- Table grow/shrink and Flow row membership changes atomically recalculate `flowRowHeightPx`.
- Following rows and pagination use the synchronized row height.


## DB-4B Fix3 — Continuation-page measured height commit (2026-09-13)
- Root cause confirmed in code: `onLayoutChange` ignored measured table height whenever `virtualPageIndex > 0`, even for ordinary non-paginated Flow blocks.
- Normal Flow blocks now persist measured DOM height on any physical page; only derived paginated Dynamic Table fragments are excluded.
- Shared-row inspector reports selected measured height separately from tallest row reservation.
- Added regression tests for continuation-page measurement policy.
