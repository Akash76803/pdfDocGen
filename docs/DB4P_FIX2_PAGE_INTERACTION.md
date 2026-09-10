# DB-4P Fix2 — Page Interaction Corrections

## Fixes
1. **Margins are independent by default.** Top/Right/Bottom/Left can be edited separately. The user can explicitly enable Linked mode when one value should update all sides.
2. **Multi-page controls are visible in Properties.** Page Properties now contains a Pages card with Add, switch, duplicate, move and delete actions, in addition to the left page tree.
3. **Tables respect usable content width after page geometry changes.** When margins, page size, orientation or custom dimensions change, table elements on the active page are re-aligned to the left margin and resized to the new usable width. New tables already use the same content bounds.

## Regression expectations
- Per-page elements/settings remain isolated.
- At least one page always remains.
- DB-4P Fix1 direct column resizing remains available after the table has been fit to the current content bounds.
