# DB-5F — Native Generation Pipeline v1

Adds a real native PDF path for Generate. Normal business invoices no longer need to mount/capture the Builder DOM when the template is native-compatible.

## Modes
- **Fast / Native (Auto)**: Builder template → native `TemplateDefinition` → `TemplateEngine` `RenderModel` → `PdfRenderer` / `CombinedPdfRenderer`.
- **Exact Preview**: existing hidden Builder + `html2canvas` path remains available as the pixel-fidelity fallback.

## Native v1 scope
Supports common invoice content: text/field tokens, data-bound text, images/signatures, dividers, basic shapes, standard Dynamic Tables, basic table summaries, Custom Tables, Flow rows, page/header/footer settings and automatic table pagination.

Auto fallback is used for multi-Builder-page templates, standalone QR/Barcode, Grouped Summary tables, advanced summary formulas, media cells inside tables, number-to-words formula functions, non-`every` header/footer repeat policies, or multiple dynamic data sources in one template.

Floating body elements can be converted to native document flow, but Generate shows a compatibility warning because Fast / Native is optimized for document-flow templates rather than pixel-positioned artwork. Exact Preview remains available whenever exact Builder positioning matters.

## Performance architecture
For a native combined batch the Builder template is parsed/converted once, static assets such as logos/signatures are prepared once, one `TemplateEngine` instance builds lightweight per-invoice `RenderModel`s, and `CombinedPdfRenderer` writes all physical pages into one PDF session. Native mode performs no per-page `html2canvas` or JPEG capture.

The hidden `TemplateBuilder` render host is now mounted only when an Exact Preview PDF or DOCX generation request actually exists. Native generation stays entirely on the Generate workspace.

## Safety / fallback
Fast / Native never silently attempts an adapter path that the compatibility analyzer marks unsupported. Generate clearly reports the reason and uses the existing Exact Preview renderer. This keeps the existing PDF/DOCX fidelity path intact while allowing the common invoice/bulk path to become substantially faster over time.
