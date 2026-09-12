# DB-4B — Row / Block Flow Engine (Authoritative Body Layout)

This document supersedes the experimental Body positioning behavior introduced in DB-4H Fix6/Fix7/Fix8 and the first DB-4B flow draft.

## Body contract

- The Body is a deterministic document-flow surface, not a free-position canvas by default.
- The first new Body element starts at the Header/Footer-aware usable Body top.
- Every new Body element starts a new flow row by default and is inserted after existing flow content.
- Flow owns the rendered X/Y coordinates. Users edit order, row membership, width, alignment and spacing instead of manually maintaining Y positions.
- Floating remains an explicit opt-in escape hatch for watermarks, stamps, decorative overlays and other intentional absolute positioning.

## Blocks and auto-height

- Text, Image, Shape, QR, Barcode, Signature, Divider, Custom Table and Dynamic Table can be Body blocks.
- Rich Text supports multiple lines with Enter. Its block height grows/shrinks from the content and following rows automatically reflow.
- Table measured height is authoritative. Adding/removing rows or switching a record with a different dynamic row count pushes every following row automatically.
- No following Flow block may overlap because an earlier block became taller.

## Rows

A Body row can contain one or more blocks horizontally.

- New blocks default to a new row at 100% usable Body width.
- Width is user-controlled as a percentage from 5–100%.
- Blocks can join the previous/next row.
- Blocks can move left/right inside the same row.
- Row alignment: Left / Center / Right.
- Horizontal inter-block gap is configurable in mm.
- Row height equals the tallest block in that row.
- The next row starts after `rowTop + tallestBlockHeight + rowGapAfter`.
- If requested widths exceed available row width, the layout scales them proportionally to remain inside the usable Body width rather than overlapping.

Examples:

```text
Row 1: [Rich Text 100%]
Row 2: [Bill To 50%] [Ship To 50%]
Row 3: [Static Table 100%]
Row 4: [Dynamic Line Items 100%]
```

If the Bill To block grows taller than Ship To, Row 2 grows to the Bill To height and Row 3 automatically moves down.

## Ordering

- Move Up / Move Down changes flow order.
- Join Previous Row / Join Next Row creates side-by-side layouts.
- New Row separates a block back into its own row.
- In Row Left / Right changes horizontal order.

## Migration

- Existing pre-flow templates remain Floating so carefully-positioned old designs do not silently move.
- Experimental saved Flow elements without a row id migrate to their own deterministic row.
- New Body content uses the new Row/Block Flow model.

## Pagination boundary

DB-4B establishes deterministic Body layout and reflow inside the current page content bounds. DB-4.4 Phase 3 will materialize arbitrary flow rows/blocks across continuation pages and make the same page plan reusable by export renderers.
