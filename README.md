# Document Builder

Standalone PDF/DOCX business-document application extracted from `Akash76803/docGen`.

## Current phase

**AUTH-UX-2 — Unified Desktop + ERP API Token (desktop OAuth / Tauri hardening and E2E validation)**

The active desktop app is intentionally document-focused. The current cloud-auth work is tracked under AUTH-UX-2; historical builder phases remain documented below for implementation context. The historical Card Designer, CAD and packaging source is preserved under `reference/` and is not part of the active build.

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

### DB-4.3A Fix1
Dynamic Table formula configuration is now available at column level via **Column Structure → Data & Format → Body value type**. Users can switch a dynamic column between Field binding, Formula, and Custom value even when the header cell is selected, while keeping result Data Type/format independent.

### DB-4.3A Fix2
Formula expressions now support imported field names with spaces and percentage-aware arithmetic. Use `[Field Name]` for an explicit safe reference; formula field chips insert this form automatically when needed.

### DB-4.3A Fix3
Formula field insertion now uses a single **Insert field** dropdown instead of crowded field chips. The dropdown lists every field from the active table Data Source (not only the first numeric fields), shows the detected field type, and inserts safe formula references such as `[Basic Value]` automatically for field names containing spaces.

### DB-4.3A Fix4 — Formula-column references
Formula editors can now insert other Dynamic Table formula columns from the same grouped dropdown as imported fields. Chained calculations are evaluated per repeated row; self/circular references stay blank safely.


## DB-4.3A Fix5 — Date / Date Time / Time Formatting
DB4-T43 date/time QA fix: document date/time formatting now preserves literal source wall-clock values, supports common DD/MM/YYYY and ISO inputs, handles legacy Excel serial values, and avoids timezone day/time shifts. See `docs/DB4_3A_FIX5_DATE_TIME_FORMATTING.md`.

## DB-4P — Page Structure & Properties
Before DB-4.3B, the builder now has a dedicated page geometry foundation: multiple standard/custom page sizes, orientation, mm/cm/in units, margins, bleed, safe area, background/border/guides, plus basic multi-page add/duplicate/reorder/delete. Each page owns its elements and properties. Existing single-page saved templates migrate to Page 1. See `docs/DB4P_PAGE_STRUCTURE_PROPERTIES.md`.

### DB-4P Fix1 — Direct table column resize
Table header dividers can now be dragged directly on the canvas to control relative column widths while preserving full page-width fit. Column Structure also includes Fit Content, Equal Width and Reset Auto actions. Manual sizing persists; untouched/reset columns continue using smart content-aware sizing.

### DB-4P Fix2 — Page interaction corrections
- Margins are independent by default; Linked is now opt-in.
- Multi-page add/switch/duplicate/reorder/delete controls are visible directly in Page Properties.
- Existing and new tables are kept inside the current usable page width when margins/page geometry change.

## DB-4.3B — Aggregations + Summary Rows
Dynamic Table summary rows now support Custom, Aggregate, and Formula modes. Aggregates include SUM/COUNT/AVG/MIN/MAX over the currently selected document group, including formula-column results. Named summary values can feed later formulas (Subtotal → Tax → Grand Total). See `docs/DB4_3B_AGGREGATIONS_SUMMARY_ROWS.md`.


## DB-4.3B Fix1 — Summary Row Full Cell Grid
- New Dynamic Table summary rows now start with exactly one base cell per current table column.
- No separate Add Cell flow is needed; users customize summary layout with existing `colSpan` / `rowSpan`.
- First cell defaults to `Subtotal`; last cell defaults to Aggregate/SUM + Currency, while middle cells remain editable.
- Existing saved summary rows remain backward compatible.

## DB-5A — Editor History / Undo-Redo Foundation
The Template Builder now includes shared Undo/Redo history with toolbar actions and Ctrl/Cmd+Z, Ctrl/Cmd+Y, and Ctrl/Cmd+Shift+Z shortcuts. Page, element, table, formula, formatting, and binding edits are captured through a bounded snapshot history. Drag/resize gestures—including direct table-column resizing—are coalesced into one undo step. Pure selection, zoom, panel UI, and measured auto-height changes do not pollute history. See `docs/DB5A_EDITOR_HISTORY_UNDO_REDO.md`.

## DB-4.4 Phase 1 — Pagination + Multi-page Overflow
Dynamic tables now have deterministic page-overflow planning in the builder: repeated rows are chunked by usable page height, header rows can repeat on continuation fragments, summary blocks stay together, and manual row page-break markers are supported. See `docs/DB4_4_PAGINATION_MULTI_PAGE_OVERFLOW.md`.

### DB-4.4 Fix1 — Document ID Preview Picker
Template Builder → Dynamic Field now shows business document identities instead of technical row numbers whenever the active page has a Dynamic Table with Parent / Document ID configured. Repeated rows for the same document are collapsed into one option; composite parent keys are shown as readable combined labels. Without a configured document key, the picker falls back to `Record #N`.

### DB-4.4 Phase 2 — Virtual Multi-Page Preview
Dynamic Table overflow now previews on separate full-size document sheets. Page 1 preserves the designed table position; continuation sheets start at the top content margin and use the full continuation-page capacity. Continuation labels are builder-only. Persistent continuation `BuilderPage` materialization remains a later pagination step.

### DB-4.4 Phase 2 Fix1
Automatic overflow continuation sheets now appear in the Pages navigator as Auto pages and can be clicked to focus their corresponding virtual sheet.


### DB-4H — Header / Footer Zones (2026-09-10)
Header/Footer page bands, repeat rules, zone element assignment, page numbering tokens, and Header/Footer-aware continuation content bounds are now implemented. See `docs/DB4H_HEADER_FOOTER_ZONES.md`.

### DB-4H Fix1 — Header/Footer zone assignment hardening
Header/Footer assignment now auto-enables the selected zone, fits and constrains elements inside the band, and exposes the active band's repeat rule directly while the element is selected. This addresses DB4H-T04/T05/T06 manual QA failures.

### DB-4H Fix2 — Header/Footer Content Containers
Header/Footer now act as reusable element containers. Text, Image, Shape, QR, Barcode, Signature and Divider can be inserted directly into either band and repeat together according to the band's repeat rule. Child properties and dynamic bindings remain intact; continuation copies are derived/read-only.

### DB-4H Fix3 — Global Header / Footer Master
Header/Footer are now document-level master regions with dedicated inspector tabs. Their full element compositions repeat across separate Builder Pages and automatic overflow continuation pages according to a single global repeat policy. Page-number tokens use the complete output-page sequence.

### DB-4H Fix4 — Global Master Positioning + Mixed Static/Dynamic Content
Header/Footer master children can now be dragged/resized from any projected output page; edits synchronize back to the one global master. Quick Left/Center/Right and Top/Middle/Bottom placement controls are available for band elements. Text-based Content editors now support mixed static text and dynamic tokens such as `Invoice No: {{InvoiceNo}}` and `Page {{pageNumber}} of {{totalPages}}`; the same token editor is reused across normal text, Header/Footer content, Shape text, QR/Barcode text, and custom table/summary text.

### DB-4H Fix5 — Mixed token visibility + typography
Mixed static/dynamic content now resolves multiple field tokens robustly, including legacy triple-brace cases, and shows a resolved preview. Text-bearing elements support font family/size, bold, italic, underline, line height, color and alignment through the Formatting inspector.

### DB-4H Fix6 — Body Positioning + Smart Placement
Body elements now have usable-area Left/Center/Right and Top/Middle/Bottom positioning controls. New Body content uses collision-aware Smart Insert instead of stacking at the same coordinates, while manual overlap remains possible after insertion. Body drag/resize and numeric geometry are constrained to Header/Footer-aware content bounds.

### DB-4H Fix7 — Manual Overlap + Layering
Body content can now be intentionally placed over existing blocks without becoming trapped behind them. Selected elements stay interactable while dragging across tables/images/shapes, and Properties includes persistent layer-order controls.

### DB-4H Fix8 — Relative Block Placement + Gap Controls
Body elements can now be positioned relative to another Body block. Select a reference block and use Place Above / Place Below with a physical gap in mm, Align Left / Center / Right, or Match Reference Width. This is especially useful for placing a static/details table immediately above or below a text block before a line-item table. Manual free drag and intentional overlap remain available after relative placement.

## DB-4B — Body Flow / Reflow Layout Engine
Body content now supports **Flow Block** and **Floating** layout modes. New Body elements default to Flow Block, so a growing Text/Table pushes later flow blocks down instead of overlapping them. Flow blocks support before/after spacing, horizontal alignment, full/custom width and Move Up/Down ordering. Floating preserves the free-position design workflow for watermarks, stamps and intentional overlap. Existing saved templates migrate as Floating to preserve layout fidelity. See `docs/DB4B_BODY_FLOW_REFLOW_LAYOUT_ENGINE.md`.

### DB-4B Row/Block Flow Engine (authoritative Body layout)

The Body is now a document-flow layout by default. New content starts at the usable Body top and appends in rows. Rich Text and Tables are auto-height; when an earlier block grows, all following rows shift automatically. New blocks default to 100% width, can be resized by percentage, can share a horizontal row, and support row alignment/gaps and reordering. Flow owns X/Y; use Floating only for deliberate overlays. This replaces the earlier experimental smart-placement/relative-placement Body workflow.

### DB-4.4 Phase 3 — Pagination Hardening / Materialization (2026-09-11)
Dynamic-table pagination now uses compact auto-height row estimates derived from cell typography instead of the old fixed 30/32px design handles, reducing false blank space before the footer. Page plans now expose deterministic page IDs, exact row ranges, header/summary flags, and used/unused height for renderer parity. See `docs/DB4_4_PHASE3_PAGINATION_HARDENING_MATERIALIZATION.md`.

### DB-4.4 Phase 3 Fix2 — Cross-page Body Flow
Body Flow now respects the complete paginated span of Dynamic Tables. Content added after a multi-page table is materialized after the table's final continuation fragment (or on the next page when required) instead of appearing in the first-page Footer area.

### DB-4.4 Phase 3 Fix3 — Complete Row Boundary
Dynamic-table pagination now estimates auto-height rows from each runtime record and the actual table width, including likely text wrapping. A row that cannot fit completely before the Footer hard boundary is moved intact to the next continuation page instead of being clipped. See `docs/DB4_4_PHASE3_FIX3_COMPLETE_ROW_BOUNDARY.md`.

### DB-4G — Grouped Summary Table
The Table creation dialog now includes **Grouped Summary** for imported-data aggregation. First filter rows to the active Parent / Document, then Group By fields such as HSN/category/warehouse and map output columns to Group value, SUM, COUNT, AVG, MIN, MAX, FIRST or LAST. A GST summary such as `HSN | Total GST | Taxable | CGST | SGST | IGST | Total` can therefore produce one row per HSN with numeric totals summed from its related line items. See `docs/DB4G_GROUPED_SUMMARY_TABLE.md`.

### DB-4G Fix1 — Grouped Formula + Unified Create/Edit
Grouped Summary tables can now calculate output columns after aggregation (for example `Total GST = [CGST] + [SGST] + [IGST]` and `Total = [Taxable] + [Total GST]`). Existing grouped tables can be reopened from Properties using the same configuration UI as Create, with their current grouping/mappings/formulas prefilled.

### DB-4G Fix3 — Grouped Summary column ordering
Grouped Summary Create/Edit now exposes explicit Move Left / Move Right controls for output columns. Column order persists after Apply/save/reload, Final Summary settings move with their corresponding columns, and widths/formatting are preserved by logical column identity during reconfiguration.

## DB-4F — Global Formula Field

- Added a lightweight **Formula Field** item in the Builder Elements panel.
- A Formula Field is a non-printing reusable document variable: give it a name and arithmetic formula, then reuse it from **Dynamic Field** anywhere in the template.
- Formula editor keeps the UI intentionally small: **Field name → Formula → Insert field → Preview**.
- Imported fields and other Formula Fields can be inserted into a formula; chained formulas resolve in bounded passes and circular/unresolved references stay blank.
- Formula Fields are stored with the template, participate in undo/redo, and do not consume Body Flow space or render on output by themselves.


### DB-4F Fix1 — Aggregate Functions

Global Formula Fields now support `SUM`, `COUNT`, `AVG`, `MIN`, and `MAX` over imported data rows. When the active source is used by a Dynamic Table with Parent / Document ID keys, aggregates are restricted to the currently previewed document; otherwise the whole active source is used. The Formula Field inspector includes an **Insert aggregate** control that inserts safe expressions such as `SUM([Taxable Value])`.

Examples:
- `SUM([Taxable])`
- `COUNT([Product])`
- `COUNT()`
- `AVG([Rate])`
- `MIN([Amount])`
- `MAX([Amount])`
- `SUM([CGST]) + SUM([SGST]) + SUM([IGST])`

## DB-5B — Single Document Generation Engine (2026-09-14)
The Generate workspace is now functional for one-document output. It uses the saved template, imported Data Source, Parent / Document selection, pre-generation validation, dynamic filename rules, PDF / DOCX Exact / DOCX Editable selection, and local generation history. The workflow deliberately reuses the existing Template Builder materialized Preview/export paths rather than creating a second formula, pagination, or renderer engine. See `docs/DB5B_SINGLE_DOCUMENT_GENERATION_ENGINE.md`.

## DB-2 Fix4 — Content Border Margin Box
The configurable page/content border now follows the page margin box instead of the physical paper edge. See `docs/DB2_FIX4_CONTENT_BORDER_MARGIN_BOX.md`.

DB-6B Fix3: API shared local template repository enabled.


## AUTH-UX-2 — Reproducible Desktop OAuth / API Token Setup

The Windows desktop app uses a Google **Desktop app** OAuth client with Authorization Code + PKCE. The desktop binary must never embed a Google OAuth client secret.

### Fresh-machine setup

1. Clone the repository and install Node 20 dependencies:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

2. Copy the desktop environment template:

```text
apps/desktop/.env.example
→ apps/desktop/.env.local
```

3. Set the public Desktop OAuth client ID:

```env
VITE_GOOGLE_OAUTH_CLIENT_ID=YOUR_DESKTOP_APP_CLIENT_ID.apps.googleusercontent.com
```

`.env.local` is machine-local and must remain ignored by Git. Do not add `VITE_GOOGLE_OAUTH_CLIENT_SECRET`, `GOCSPX-...`, raw `pdfdg_*` tokens, or bootstrap bearer-token values to committed files.

4. For local token-hybrid API startup, provide credentials through the environment before launching the API:

```powershell
$env:API_AUTH_MODE = "token-hybrid"
$env:API_AUTH_STATIC_BEARER_TOKEN = "<local bootstrap token>"
$env:API_AUTH_GOOGLE_CLIENT_ID = "<same Desktop OAuth client ID>"
node apps/api/start-local.js
```

5. Run the native desktop shell:

```bash
npm run tauri:dev
```

For a production Windows installer:

```bash
cd apps/desktop
npx tauri build
```

The NSIS installer is generated under `apps/desktop/src-tauri/target/release/bundle/nsis/`.

### Desktop token flow

```text
Settings → Generate Token
→ system-browser Google verification
→ loopback callback on 127.0.0.1
→ Google ID token
→ POST /api/v1/auth/tokens
→ one-time pdfdg_* integration token
→ secure OS credential storage
```

The same `pdfdg_*` token can be used by Desktop publish/generation and configured separately in Salesforce/ERP credentials. The server stores only the token hash and metadata.

### Copy an existing token for ERP/Salesforce

When Settings shows **Connected**, choose **Copy Existing Token**. Confirm the security prompt; the desktop reads the already saved `pdfdg_*` token from the operating-system credential manager and copies it directly to the clipboard. It does **not** display the secret in the UI, log it, issue a replacement token, or require another Google login. Paste it only into a trusted ERP/Salesforce credential field and clear the clipboard afterward.

**Generate New Token** issues an additional token; it is not a way to view the old one and does not automatically revoke the existing server token. To invalidate a token, use **Revoke Token** for the currently stored credential. Replacing a credential in an ERP requires updating that system separately.

### Security notes

- Google OAuth client secret is not used by the desktop PKCE flow.
- Never log authorization codes, ID/access/refresh tokens, or `pdfdg_*` values.
- Keep committed local-start scripts reproducible by reading secrets from environment variables rather than hardcoding them.
- Keep `Cargo.lock` committed for reproducible Rust/Tauri builds.
- The Tauri filesystem features `fs-create-dir` and `fs-remove-file` are intentional because the desktop allowlist enables `createDir` and `removeFile`.
