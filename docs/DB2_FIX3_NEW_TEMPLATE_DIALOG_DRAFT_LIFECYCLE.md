# DB-2 Fix3 — New Template Creation Dialog + Draft Lifecycle

## Purpose
Turn **New template** into a safe template-creation workflow instead of silently opening a generic blank builder.

## Implemented
- Setup dialog: Template Name, Document Type, Page Size, Orientation and Starter.
- Starters: Blank and Invoice Starter.
- `Create Template` immediately creates an independent **Draft** library entry and makes it active.
- Builder opens with the selected page geometry and starter content.
- Explicit Save promotes the library entry from Draft to Saved.
- Existing templates are never overwritten by creating a new template.
- Template cards show Draft/Saved state.
- Builder also has a **New** action. If the current design has unsaved changes, it asks before discarding them.
- Existing active-template compatibility key remains intact for Generate/PDF/DOCX flows.

## Regression boundary
No changes were made to Formula, Body Flow, pagination, PDF, DOCX Exact, DOCX Editable or Generate renderer logic.
