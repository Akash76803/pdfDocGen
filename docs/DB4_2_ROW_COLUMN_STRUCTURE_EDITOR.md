# DB-4.2 — Row / Column Structure Editor

## Purpose
Make an existing table structurally editable after creation without rebuilding the table.

## Custom Table
- Add Row Above / Below
- Duplicate Row
- Delete Row
- Move Row Up / Down
- Add Column Left / Right
- Duplicate Column
- Delete Column
- Move Column Left / Right
- Row inspector: ID, kind, height/auto-height, keep-together, repeat-header where applicable
- Column inspector: ID, label, width, minimum width, alignment

## Dynamic Table
- Runtime body rows remain data-driven and cannot be manually inserted/deleted.
- Columns can be added, duplicated, deleted and reordered.
- Header rows and custom summary rows can be structurally edited.
- The body template receives column structure changes automatically while preserving the single repeating body-row template.

## Identity / Persistence
- Unaffected table, row, column and cell IDs are preserved.
- New rows/columns/cells receive new UUIDs.
- Duplicate operations create independent IDs while copying the source row/column configuration.
- All structure changes are stored in the existing table schema and restored by template save/reload.

## Span safety
- Column insertion/deletion is colSpan-aware. If another row has a merged cell crossing the insertion/deletion point, its span is adjusted instead of silently corrupting the grid.
- Column reordering is intentionally disabled while any colSpan merge exists. The user should split merged cells before reordering; add/delete operations remain available.
- Existing rowSpan/colSpan cell controls remain available from DB-4.1.

## Verification
Focused structure harness passes for:
- custom row add/delete with stable unaffected row IDs
- dynamic column add with one body template retained
- colSpan-aware column insertion/deletion
- merged-column reorder guard

Full monorepo typecheck still depends on installing the workspace dependencies under the required Node 20 environment.

## Fix1 - Cell selection / structure action activation
Manual QA found that clicking a table cell updated the table cell selection but did not always select the parent Table element because the cell pointer event stops propagation to the draggable canvas element. This meant the Row/Column Structure inspector could remain hidden or inactive.

Fix1 synchronizes table-cell selection with parent Table selection. Clicking any table cell now selects the Table element first, then updates `selectedCellId`, so Row Above/Below, duplicate/delete/move row, and column structure controls act on the intended selected design-time cell/row/column.

## Fix2 — Compact Properties Inspector

The table Properties panel now groups **Row Structure**, **Column Structure**, and **Selected Cell** into separate visual cards. Each card has a compact symbol header and status badge. Internal row/column/cell IDs are collapsed under **Technical ID** so normal editing space is not consumed by long identifiers. Structural actions use a compact icon/label grid and destructive Delete actions are visually separated. The layout remains responsive in narrow inspector widths.
