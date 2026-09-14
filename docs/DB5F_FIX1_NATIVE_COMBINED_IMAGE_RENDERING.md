# DB-5F Fix1 — Native/Combined PDF Image Rendering

## Problem
Fast / Native Combined PDF could omit image/signature blocks. The native adapter only carried the element's manual/static image source and ignored record-bound image values. Remote/blob image sources were also passed as `DATA_URL` without first normalizing them, and the native PDF renderer relied on `createImageBitmap`, which is not guaranteed in every desktop webview.

## Fix
- Resolve image/signature `binding` independently for each invoice before building its native RenderModel.
- Preserve manual image as fallback when the record-bound image is empty.
- Normalize HTTP/blob images to embedded data URLs.
- Accept long raw Base64 image values from imported CSV/Excel and wrap them for browser decoding.
- Cache normalized bound/static sources so repeated logos do not refetch/redecode across a Combined PDF batch.
- Add an HTMLImageElement/canvas fallback when `createImageBitmap` is unavailable.
- Cache renderer-side prepared image bytes across documents.
- Preserve CombinedPdfRenderer resource namespacing (`D1_Im1`, `D2_Im1`, …) so repeated images remain valid in one PDF.

## Scope
Native Fast PDF only. Exact Preview PDF/DOCX paths are unchanged.
