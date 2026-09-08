# DB-2 — Core Template Builder

## Goal
Turn the DB-1 structural editor into an interactive document canvas while keeping the workspace canvas-first and document-focused.

## Implemented
- Canvas-first layout: global application sidebar collapses to icon rail while Template Builder is active.
- Elements panel reduced to 184px and inspector to 250px.
- Both builder side panels can be collapsed independently to maximize canvas space.
- A4/Letter, portrait/landscape page sizing.
- Larger default fit zoom (92%) with zoom in/out/fit controls.
- Add by click: Text, Image, Table, Shape, QR, Barcode, Signature, Divider.
- Selection and element list selection.
- Pointer drag/move on the page.
- Bottom-right resize handle.
- Inspector numeric X/Y/width/height editing.
- Text/content editing where applicable.
- Basic font size, text color, shape fill and left/center/right alignment.
- Dynamic field placeholder binding stored on each element.
- Duplicate and delete.
- Local template persistence using localStorage, including name, page settings and elements.

## Scope intentionally deferred
- Full image picker/import.
- True QR/barcode rendering from dynamic values.
- Rich text editor.
- Rotation and advanced arrange operations.
- Undo/redo history.
- Multi-selection/grouping.
- Real table row/column designer and repeating rows.
- Template-engine data evaluation and conditional visibility UI.
- Renderer parity/export wiring.

## Manual smoke
1. Open Template Builder and confirm the app sidebar is icon-only.
2. Confirm the canvas is visibly wider than DB-1.
3. Collapse left and right panels independently; canvas should expand.
4. Add each of the eight element types.
5. Select an element and drag it.
6. Resize it using the bottom-right blue handle.
7. Edit X/Y/width/height in Properties.
8. Edit text/content and formatting.
9. Add a Dynamic Field value such as `customer.name`.
10. Duplicate/delete an element.
11. Change A4/Letter and Portrait/Landscape when no element is selected.
12. Save, reload the app, and confirm the template restores from local storage.

## Next phase
DB-3 should connect the existing datasource/template/mapping engines so imported Excel/CSV/JSON fields become real bindable fields, with record preview and evaluated content on the canvas.


## Fix1 — Text alignment
- Fixed Left / Center / Right text alignment in canvas text elements.
- Text content now occupies the full element width so CSS `text-align` visibly applies.
- Existing drag, resize, properties, and persistence behavior is unchanged.
