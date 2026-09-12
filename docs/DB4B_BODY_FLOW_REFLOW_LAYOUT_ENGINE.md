# DB-4B — Body Flow / Reflow Layout Engine

## Purpose
Business documents should not behave like a pure free-position design canvas. When a Text/Table block grows, the blocks that follow it must move down instead of overlapping it.

## Layout modes

### Flow Block (default for newly-added Body content)
- Participates in a top-to-bottom document stack.
- Later Flow Blocks are positioned from the measured/rendered height of earlier Flow Blocks.
- Supports physical `Gap before` / `Gap after` values in millimetres.
- Supports Left / Center / Right alignment inside Header/Footer-aware Body bounds.
- Supports Full Body Width or Custom Width. Tables always use full Body width.
- Move Up / Move Down changes flow order.
- Dynamic/custom table auto-height updates automatically push later Flow Blocks down.

### Floating
- Keeps independent X/Y coordinates.
- Allows intentional overlap, watermark/stamp/decorative layouts and existing layer-order controls.
- Dragging a Flow Block on the canvas intentionally converts it to Floating.

## Compatibility
Older saved templates are migrated as Floating to preserve their exact existing layout. Newly-added Body elements use Flow Block by default.

## Pagination boundary
This phase establishes deterministic same-page Body reflow. Pagination-aware continuation of arbitrary non-table Flow Blocks is intentionally completed in DB-4.4 Phase 3 using the same flow order and measured block heights.
