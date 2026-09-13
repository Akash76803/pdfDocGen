# DB-4.5B — Preview → PDF Exact Parity v1

## Strategy
The first parity renderer deliberately captures the tested physical Preview page instead of rebuilding layout in a separate PDF pagination engine. Each unscaled `.document-page` is rasterized at 192 DPI, then embedded as a physical-size JPEG page in the existing PDF writer.

## Covered automatically
Because PDF consumes the rendered Preview page, it carries the same:
- Header/Footer repeat rules and Page X of Y values
- Body Flow positions
- Dynamic Table continuation fragments and row breaks
- Grouped Summary and Final Summary
- Global Formula Fields / mixed tokens
- Custom Tables
- Text styles, shapes, dividers
- Images, Signature, QR and Barcode DOM output
- Page background, border, page size, orientation and margins

## Export behavior
- `PDF` button added to Template Builder top toolbar.
- All Builder Pages are visited in document order; their continuation pages are exported in materialized order.
- Selection chrome, resize handles, guides and column rulers are stripped from export capture.
- Mixed page sizes are supported because each PDF page uses its own physical dimensions.
- After export, the editor restores the user's original Builder Page, preview page and selection.

## Known v1 tradeoff
This parity path is raster-exact rather than vector-text PDF. It prioritizes Preview/PDF fidelity first. A later optimization can replace eligible text/vector layers while preserving the same DB-4.5A page manifest.
