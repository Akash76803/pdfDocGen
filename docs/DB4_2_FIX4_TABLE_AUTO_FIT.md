# DB-4.2 Fix4 — Table Auto-Fit to Page

## Goal
Tables must not require horizontal scrolling in the document canvas. All columns fit inside the current table element/page width.

## Behavior
- Column `width` remains persisted for backward compatibility and inspector editing.
- At render time column widths are treated as relative weights and normalized to 100%.
- New tables are created at the document-safe usable page width (30 px inset on each side).
- Horizontal table scrolling is disabled; long content wraps inside cells.
- Resizing the table element automatically redistributes columns within the new width.
- Existing saved tables receive the same render-time auto-fit behavior without schema migration.

## QA
- Create a 7+ column Dynamic Table and verify no horizontal scrollbar appears.
- Resize the table narrower/wider and verify all columns remain inside the table.
- Change one column Width in inspector and verify relative proportions change while total still fits 100%.
- Verify Custom Table uses the same behavior.
