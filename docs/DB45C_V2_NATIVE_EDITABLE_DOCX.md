# DB-4.5C v2 — Native Editable DOCX

## Goal
Add a second DOCX export mode without replacing or changing the existing fidelity-first DOCX Exact path.

## Export modes
- **DOCX Exact** — existing DB-4.5C v1. Captures each materialized Preview page as full-page artwork for maximum Preview fidelity.
- **DOCX Editable** — DB-4.5C v2. Converts the materialized Preview DOM into native WordprocessingML text and tables so users can edit content in Microsoft Word / LibreOffice Writer.

## Safety / compatibility
The v1 exact exporter, PDF exporter, Body Flow, pagination, Formula engine, table engines and persistence contracts are not modified by v2. The new button has an independent export state and reuses the same DB-4.5A physical page manifest only for page order/context.

## Editable v2 mapping
- Text / Shape text / Header / Footer content → native Word text.
- Custom / Dynamic / Grouped Summary tables → native Word tables, including column widths and merged-cell metadata where present.
- Table border styles → native Word table border styles.
- Formula Fields / Number-to-Words → resolved native text values.
- Side-by-side Preview blocks → zero-border Word layout table with spacer cells so left/right and distributed-row composition is retained as closely as Word permits.
- Images / signatures → Word images.
- QR / Barcode visual blocks → raster media inside the editable document (their surrounding document remains editable).
- Divider → native Word paragraph border.
- One Word section per DB-4.5A physical page preserves page size/orientation and explicit page order.

## Expected trade-off
DOCX Editable is structurally editable, therefore Word's own layout engine may reflow text or table heights slightly. For pixel-exact output, continue using PDF or DOCX Exact. Both DOCX modes intentionally remain available.

## QA focus
1. DOCX Exact output remains unchanged after v2 installation.
2. DOCX Editable opens without a repair warning.
3. Text can be edited directly in Word.
4. Table cells can be edited directly in Word.
5. Side-by-side rows remain in the same order and approximate horizontal placement.
6. Dynamic/Grouped table values, Formula Fields and Number-to-Words match Preview.
7. Multi-page/continuation order and mixed page geometry remain correct.
8. Images/Signature/QR/Barcode remain visible.
9. Editor-only chrome is not emitted as native content.
