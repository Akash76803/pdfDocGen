# UX-3 Fix1 — Table Rows / Cell Hierarchy

## Goal
Reshape the Table inspector into a clearer hierarchy without changing TableDefinition persistence, renderer behavior, formulas, grouping, media cells, pagination, or existing table mutation helpers.

## Changes
- Table tabs are now: Properties | Columns | Rows | Formatting | Conditions.
- Removed the Body Flow `Manage row` control from Table Layout. Table placement remains Flow/Floating, but element-row mechanics are not exposed inside Table settings.
- Added a dedicated Rows workspace with Header Row, Body Row Template, and Custom/Summary Row navigation.
- Custom tables expose Add Row from the Rows workspace.
- Dynamic tables expose Add Summary Row from the Rows workspace (except Grouped Summary mode, where grouped configuration remains authoritative).
- Existing row Height, Auto height, Keep together, Page break, Repeat header, Add/Move/Duplicate/Delete actions remain unchanged and are surfaced under Rows.
- Selected Cell remains the same single table selection state and is visible from both Columns and Rows workspaces.
- Selected Cell is visually split into Cell Properties, Cell Layout, and Cell Style sections while preserving the same updateTableCell handlers.
- Properties now hides row/column/cell structure editors so whole-table settings stay focused.
- Columns continues to use existing column mutation/value/format handlers.
- Formatting continues to own table border + selected-cell visual formatting.

## Regression Safety
No changes were made to TableDefinition shape, dynamicRows(), pagination, grouped summary evaluation, formula evaluation, native PDF generation, exact PDF generation, or table mutation helper semantics.

## Validation performed
- TemplateBuilder.tsx TypeScript/TSX syntax transpile: PASS.
- app.css brace validation: PASS.
- Manual UI / full renderer regression: PENDING.
