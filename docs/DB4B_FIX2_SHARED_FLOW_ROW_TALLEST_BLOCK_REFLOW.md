# DB-4B Fix2 — Shared Flow Row Tallest-Block Reflow

## Problem
Two Body Flow blocks can intentionally share one horizontal row (for example Bill To / Ship To tables). When one table grows after a row is added, the next logical row must move below the tallest block in that shared row. A block-level height update alone is not enough unless the row is recalculated atomically.

## Layout contract
- A Flow row is identified by `flowRowId`.
- Each block keeps its own measured visual height.
- Shared row height = `max(member measured heights)`.
- Every member receives the same derived `flowRowHeightPx` cache.
- The next Flow row starts after the shared row height + configured row gap.
- Shorter side-by-side blocks are **not stretched**; only the row reservation uses the tallest block.
- When the tallest block shrinks, the shared row height is recalculated from current member heights so following rows move back up.

## Runtime behavior
TableCanvas continues to publish the real rendered table height. Template Builder now applies that measurement and synchronizes the complete Flow row in one state update. The Body Flow and pagination materializer both use the synchronized row height.

## Covered cases
- 50/50 Custom Table + Custom Table
- table + text in one row
- 3 blocks in one row
- grow and shrink
- row reorder/join/new-row operations
- continuation/PDF materialization
- update-loop guard remains intact
