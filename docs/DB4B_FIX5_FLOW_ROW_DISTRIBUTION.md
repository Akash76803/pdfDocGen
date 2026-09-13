# DB-4B Fix5 — Flow Row Distribution

## Goal
Allow side-by-side Flow blocks to consume their own widths while the row automatically distributes the remaining usable horizontal space. The common invoice case is a left-aligned block and a right-aligned block with a flexible blank middle area.

## Modes
- **Packed** — existing behavior. Uses Block gap + Row alignment (Left / Center / Right).
- **Space Between** — first member touches the left usable edge, last member touches the right usable edge, all remaining space is distributed between members.
- **Space Around** — equal space around every member (outer space is half of inner space).
- **Space Evenly** — equal outer and inner spaces.

## Example
Two Shapes in the same Flow row:
- Width: 35% + 35%
- Row Distribution: Space Between

Result: left Shape stays on the left usable edge, right Shape stays on the right usable edge, and the remaining ~30% becomes automatic blank space in the middle. No spacer element is required.

## Persistence / row behavior
Row distribution is a row-level property and is synchronized to all members. Joining an existing row inherits the target row's alignment/distribution/gap settings so reordering members cannot unexpectedly change the row layout.

## Compatibility
Older templates default to **Packed**, preserving existing layouts. Pagination, tallest-row reflow, Move Row Up/Down, and Preview→PDF continue to consume the same projected Flow geometry.
