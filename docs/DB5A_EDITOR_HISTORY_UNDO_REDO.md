# DB-5A — Editor History / Undo-Redo Foundation

## Purpose
Add a shared editor-history layer so destructive and structural builder changes can be safely reversed without creating separate undo logic for every tool.

## Implemented scope
- Toolbar **Undo** and **Redo** actions.
- Keyboard shortcuts: **Ctrl/Cmd+Z**, **Ctrl/Cmd+Y**, and **Ctrl/Cmd+Shift+Z**.
- Snapshot history for document name, pages, page settings, and page-owned elements/tables.
- Element add/delete/duplicate and inspector property changes.
- Element move/resize.
- Page add/duplicate/delete/reorder/rename and page-geometry changes.
- Table structure/content/formula/format changes that flow through the builder element model.
- Direct table-column drag resize.
- Image/signature element property replacement through the existing element update path.
- A new edit clears the redo branch.
- History is bounded to the latest 100 editor actions.
- Save/reload does not persist the transient undo stack; a reloaded editor starts with a fresh history.

## Gesture coalescing
Pointer move/resize operations open one history gesture at pointer-down and close it at pointer-up/cancel. Intermediate pointer-move updates are not added as separate undo entries. Direct table-column resize uses the same interaction hooks.

## Non-history state
Pure UI navigation/selection state is intentionally excluded. Selecting a table cell, selecting a page, zoom, panel collapse state, and measured auto table height do not create undo entries.

## Manual QA
1. Add an element, Undo, Redo.
2. Drag an element across the page; one Undo should restore the pre-drag position.
3. Resize an element; one Undo should restore the old size.
4. Add/delete/duplicate/reorder/rename pages and undo each action.
5. Change margins/page size and undo.
6. Add/delete/reorder table rows/columns; change cell binding/formula/format and undo.
7. Drag a table column divider; one Undo should restore the previous pair of widths.
8. Undo two actions, make a new edit, and confirm Redo is disabled.
9. Save/reload and confirm persisted content remains correct while Undo/Redo starts empty.
