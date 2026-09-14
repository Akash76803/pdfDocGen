# DB-5F — Native Generation Pipeline v1

This package adds a long-term Fast / Native PDF generation path for compatible business-document templates.

Key changes:
- Generate can use native `TemplateEngine` + `PdfRenderer` / `CombinedPdfRenderer` instead of page-by-page DOM screenshots.
- Native Combined PDF prepares the Builder template and static assets once per batch, then builds lightweight per-document RenderModels.
- Native PDF text/tables stay PDF-native and selectable/searchable.
- Exact Preview remains available and is selected automatically when the compatibility analyzer finds a feature not yet covered by the native v1 adapter.
- The hidden full `TemplateBuilder` now mounts only for an active Exact/DOCX request rather than whenever Generate is open.
- Existing Flow, Pagination, Exact PDF, DOCX Exact/Editable and Combined PDF fallback paths are preserved.

See `docs/DB5F_NATIVE_GENERATION_PIPELINE.md` for supported/fallback scope.
