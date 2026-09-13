# DB-4.5B Fix5 — Custom Table Auto-Height / Body Reflow

## Problem
When a row was added to a Custom Table, the visible table grew but its persisted Body block height could remain at the previous value. A following Flow block (for example a Grouped Summary table) therefore stayed at the old Y position and overlapped the new row.

## Cause
The table height publisher measured only the inner `<table>` during the layout effect. In some edit/update paths the new content could overflow the old canvas wrapper before the parent Body Flow received the new height, so downstream rows were laid out using the stale logical height.

## Fix
- Measure both the table shell and inner table.
- Use `scrollHeight` + rendered bounding height so overflow from newly-added rows is included.
- Publish the measurement on the next animation frame after DOM/layout settles.
- Observe both shell and table with `ResizeObserver`.
- Keep the existing duplicate-height guard to avoid render loops.
- Body Flow remains the source of X/Y; once the table's measured height changes, all later Flow rows shift automatically.

## Expected
Adding/removing Custom Table rows immediately grows/shrinks the table block and moves every following Flow row without overlap. Same-row blocks continue to use the tallest block as row height.
