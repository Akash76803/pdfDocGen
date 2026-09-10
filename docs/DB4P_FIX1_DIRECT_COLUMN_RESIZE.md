# DB-4P Fix1 — Direct Table Column Resize

## Goal
Allow users to control Dynamic and Custom Table column widths directly from the canvas and from Column Structure without creating horizontal page overflow.

## UX
- Hover a header column divider to get a column-resize cursor.
- Drag left/right to resize the selected column while the adjacent column compensates.
- The total table width remains 100% of the table/page content width.
- Manual widths are persisted as strong relative sizing hints.
- Column Structure exposes `Fit Content`, `Equal Width`, and `Reset Auto` actions.

## Safety
- Direct divider drag is offered only on unmerged header cells (`colSpan = 1`).
- Existing span-aware add/delete/reorder behavior remains unchanged.
- Smart auto-fit remains the default for untouched columns.

## Acceptance
1. Resize Quantity narrower and Description wider from the canvas.
2. No horizontal scrollbar/page overflow is introduced.
3. Save/reload preserves manual width preference.
4. Fit Content returns one selected column to auto sizing.
5. Equal Width makes all columns equal.
6. Reset Auto returns all columns to content-aware sizing.
