# DB-4.4 Phase 3 Fix3 — Complete Row Boundary

## Problem
A dynamic-table record with wrapped content could be estimated as a one-line row. The paginator therefore allowed the row onto the current page, while the browser rendered it taller and clipped the bottom of the row at the page/Footer boundary.

## Fix
- Pagination now estimates auto-height body rows per runtime record.
- Column width, font size, padding, explicit newlines, and approximate text wrapping are included.
- The actual table block width is supplied to the pagination planner from the Builder element.
- A complete runtime row must fit inside the Body capacity before it is committed to the page.
- If it does not fit, the whole row moves to the next continuation page.
- Footer hard-boundary and compact-packing behavior remain enabled.

## Acceptance
1. No body row is partially clipped at a page boundary.
2. Long/wrapped Product Description rows move intact to the next page when needed.
3. No duplicate or missing runtime rows.
4. Summary remains once on the final fragment and never overlaps Footer.
