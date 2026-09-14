# DB-5C Fix3 — Background Generation + Blocking Progress Overlay

## Goal
Keep the user on Generate while PDF/DOCX work is rendered by an off-screen Template Builder host. Do not visibly navigate to Template Builder for every invoice.

## Behavior
- Generate button queues a request without switching route.
- App mounts TemplateBuilder as an off-screen render host only while Generate is the visible route.
- Request/history/progress custom events coordinate same-tab rendering without depending on browser `storage` events.
- Bulk orchestration stays on Generate and advances sequentially after each history result.
- A large modal circular progress indicator blocks accidental edits while rendering.
- PDF text blinks: `Your PDF is generating...`; combined mode uses `Your combined PDF is generating...`.
- Bulk percentage includes completed invoices plus current invoice page progress.
- Single generation shows page-level renderer progress where available.

## Render stability hardening
Before freezing the materialized render manifest, the renderer now also verifies that the DOM contains the expected number of physical Preview pages for every builder page. This specifically guards the prior failure `Preview output page 2 is unavailable after waiting for layout` when a stale 2-page model had already collapsed to one settled DOM page.

## Compatibility
Existing PDF/DOCX renderer functions, formulas, Body Flow, pagination, combined PDF append/finalize behavior and Template Library contracts are reused rather than duplicated.
