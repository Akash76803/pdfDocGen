# DB-4.4 Phase 1 — Pagination + Multi-page Overflow

Implemented on top of the DB-5A verified baseline.

## Scope in this increment
- Dynamic-table automatic pagination planner based on available page content height.
- Continuation fragments when repeated rows exceed the active page's bottom content margin.
- Repeating header rows on continuation fragments.
- Summary block kept together and moved to a continuation fragment when needed.
- Row-level `Keep together` remains available.
- Row-level `Page break before this row` foundation.
- Table-level pagination controls for auto overflow, repeat header, keep repeated rows together, keep summary together, and row-split renderer policy.
- Pagination configuration remains part of the persisted table schema and therefore participates in DB-5A Undo/Redo.

## Important boundary
This increment provides deterministic pagination planning and builder continuation preview. Physical creation of persistent continuation `BuilderPage` records and final PDF/DOCX renderer parity remain follow-up work in DB-4.4 Phase 2 / DB-4.5.
