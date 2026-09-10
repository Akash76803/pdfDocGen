# DB-4.4 Phase 2 — Virtual Multi-Page Sheet Preview

## Purpose
Turn the Phase 1 continuation-fragment preview into page-aware visual pagination while keeping continuation pages derived from the active Dynamic Table rather than persisted BuilderPage records.

## Implemented
- Overflowing Dynamic Tables now render across separate full document sheets in the builder.
- Page 1 keeps the table at its designed Y position.
- Continuation sheets start the table at the page's top usable margin.
- Every virtual sheet uses the active page size, orientation, margins, background, border, safe-area and guide settings.
- Repeated table headers continue to follow `pagination.repeatHeader` and row `repeatOnEveryPage` settings.
- Summary keep-together and manual-break planning continue to use the DB-4.4 planner.
- The pagination planner now accepts separate first-page and continuation-page capacities. This allows continuation pages to use the full usable height rather than inheriting Page 1's lower table start position.
- Virtual page labels are builder-only UI and do not belong to document content.
- Continuation fragments are read-only positional projections: dragging/resizing the table is done on Page 1, preventing accidental movement of the underlying source element from a continuation sheet.
- Builder topbar reports virtual preview page count when overflow exists.

## Phase boundary
Virtual continuation sheets remain derived preview pages. They are not yet added to the persistent `BuilderPage[]` collection. Persistent page materialization / export page-plan hardening remains a later DB-4.4 increment before DB-4.5 renderer parity.

## Manual QA
1. Place a Dynamic Table low enough on Page 1 that only a few rows fit; load enough rows for 3 pages.
2. Confirm Page 1 preserves designed Y while Page 2+ start at the top margin.
3. Confirm each continuation appears on a distinct full-size white sheet with page gap and builder-only label.
4. Confirm header repeats on Page 2+ when enabled.
5. Confirm bottom margins are respected and no row fragment visually runs into the next sheet.
6. Confirm Subtotal/Tax/Grand Total stay together when configured.
7. Change A4/Letter/custom size, orientation and margins and confirm virtual sheets recalculate.
8. Switch Parent/Document ID and confirm page count recalculates.
9. Save/reload and confirm pagination settings persist; derived preview pages are rebuilt.
