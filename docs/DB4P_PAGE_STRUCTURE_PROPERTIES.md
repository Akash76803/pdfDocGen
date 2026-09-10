# DB-4P — Page Structure & Properties

## Purpose
Stabilize document page geometry before DB-4.3B summaries, DB-4.4 pagination, and DB-4.5 renderer parity.

## Implemented in this phase
- Page presets: A3, A4, A5, Letter, Legal, Tabloid, Executive, Custom.
- Portrait / Landscape orientation.
- Display units: mm, cm, inch; internal geometry remains millimetre-based and converts to 96-DPI canvas pixels.
- Custom page width / height.
- Per-page margins: top/right/bottom/left with linked/unlinked editing.
- Per-page bleed: top/right/bottom/left with linked/unlinked editing.
- Safe-area inset.
- Page background, border colour, border width, and guide visibility.
- Margin / safe-area / bleed guides on canvas.
- Multi-page template foundation: add, duplicate, rename, reorder, delete, and switch pages.
- Each page owns its own settings and element list.
- Legacy DB-2…DB-4.3A single-page local templates migrate automatically to Page 1.
- New tables are created inside the current page's usable content bounds (page width minus left/right margins).

## Page geometry contract
`usableWidth = pageWidth - leftMargin - rightMargin`

`usableHeight = pageHeight - topMargin - bottomMargin`

Bleed is outside the trim/page edge. Safe Area is inside the configured margins.

## Deferred
- Automatic content overflow continuation across pages.
- Master pages / reusable headers and footers.
- Automatic page-number tokens.
- Table repeat-header pagination.
- PDF/DOCX page-property parity.

Those continue in DB-4.4 / DB-4.5 after this page foundation is verified.

## Fix1 — Direct table column sizing
Page-width auto-fit remains mandatory, but users can now resize table columns from header dividers. The resized column and its neighbor rebalance inside the same table width. Column Structure also provides Fit Content, Equal Width and Reset Auto.
