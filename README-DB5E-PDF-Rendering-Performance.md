# DB-5E — Long-term PDF Rendering Performance Foundation

## What changed
- Added persistent PDF render profiles: Standard/Fast 144 DPI, Balanced 192 DPI, Print Quality 300 DPI.
- Standard/Fast is the backward-compatible default for generation requests that do not specify a profile.
- Single, Separate Bulk, and Combined PDF requests carry their selected render profile into the hidden renderer.
- Existing Exact PDF renderer is reused; no duplicate PDF implementation was introduced.
- Added per-page timing instrumentation around image decode, html2canvas capture, JPEG encoding, and total raster time for future profiling/telemetry.
- Generate UI exposes the profile and explains the speed/quality tradeoff; the selected profile persists locally.

## Why this is long-term safe
The expensive operation is rasterizing each physical Preview page. DPI is now an explicit generation policy rather than a hard-coded 192 DPI constant. This allows future server/headless render workers and telemetry to keep the same request contract.

## Compatibility
- Direct Template Builder PDF export remains at its existing fidelity unless a generation request supplies a profile.
- DOCX Exact and Editable are unchanged.
- Formula, Body Flow, pagination, combined PDF assembly, and template schema are unchanged.
