# DB-4.1 Fix6 — Table Cell Image Cover

## Purpose
Make image cells behave like media frames instead of small centered thumbnails.

## Behavior
- Default fit for table image cells is **Cover**.
- Cover fills the complete cell while preserving aspect ratio and cropping overflow.
- Contain keeps the whole image visible and may leave empty space.
- Stretch fills width and height without preserving aspect ratio.
- Image rendering uses the full cell surface (zero media padding).
- rowSpan/colSpan merged cells use the full merged region as the image frame.
- Resizing the table/cell changes the visible crop live.
- Existing table image cells without an explicit fit are treated as Cover for backward-safe visual improvement.

## QA
Test normal cells, resized rows/columns, rowSpan, colSpan, local images, bound URL/Base64 images, save/reload, and switching Cover/Contain/Stretch.
