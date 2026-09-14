# DB-2 Fix2 — Template Library

## Goal
Turn the DB-1 placeholder Templates page into the working template library expected by the desktop product.

## Behavior
- Existing single saved template is migrated automatically into the library; no current design is lost.
- Every Builder Save creates/updates a library entry instead of silently overwriting the whole library.
- Template cards show name, inferred document type, page count, element count, and updated time.
- Search and document-type filters work on the saved library.
- Clicking a card makes it the active saved template and opens it in Template Builder.
- **New template** and **Create first template** start a genuinely blank Builder instead of reopening the previous saved document.
- Delete removes a template after confirmation.

## Compatibility
The existing `document-builder.template.db2.v1` storage key remains the active-template contract. Generate, PDF, DOCX Exact, DOCX Editable and all existing Builder logic continue to read the same active saved template. The new library is an index/history layer around that contract rather than a renderer or schema rewrite.
