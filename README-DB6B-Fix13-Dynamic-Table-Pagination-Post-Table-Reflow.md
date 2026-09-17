# DB-6B Fix13 — Dynamic Table Pagination & Post-Table Reflow

Baseline: Git `main` commit `5ec6dde6bab247ab365a566c0eef97a53cee0027`.

## Problem
The Desktop exact export paginated long Dynamic Tables correctly, but the API native PDF path projected every Builder body element into absolute coordinates. When a Dynamic Table grew beyond its design-time height, the table continued drawing through the page while amount summaries, grouped/HSN tables and shapes stayed at their saved Y positions. This caused severe overlap and left the following physical page mostly empty.

## Fix
The Desktop-native PDF path is now hybrid instead of purely absolute:
- Builder body elements whose `layoutMode` is `flow` remain FLOW blocks in the API adapter.
- True floating body elements remain ABSOLUTE and keep their saved x/y behavior.
- The adapter stores Header/Footer-aware body top/bottom insets for overflow continuation pages.
- The PDF renderer groups projected FLOW blocks into Builder flow rows.
- Dynamic Tables use the existing measured row paginator, including wrapped row heights, footer rows and repeated table headers.
- Overflow creates physical continuation pages inside the current Builder page.
- Post-table flow content resumes from the table's actual runtime end position instead of its design-time Y coordinate.
- Flow rows that no longer fit move to a continuation page; side-by-side rows keep their row relationship.
- Header/Footer master blocks are drawn after runtime pagination so they repeat on every resulting physical page.
- Deferred `pageNumber` / `totalPages` tokens resolve using the final physical page count.
- Additional Builder pages are still preserved. If Builder page 1 creates one overflow continuation and Builder page 2 already exists, the output is 3 physical pages.

## Acceptance target
For the supplied long Tax Invoice overflow example:
- No Dynamic Table row may overlap amount-in-words, tax summary, grouped HSN summary or shapes.
- The table header repeats on the continuation page.
- All line items and totals are preserved.
- Post-table content appears only after the final table fragment.
- Header/Footer/page tokens use the final physical page count.
- Short invoices continue to render normally.

## Verification performed
- Latest Git baseline `5ec6dde6bab247ab365a566c0eef97a53cee0027` was checked before implementation.
- Latest upstream Fix12/typecheck deltas relevant to the working package were synchronized before final packaging.
- Targeted TypeScript build PASS for contracts, template-engine, renderer-sdk, renderer-pdf, renderer-docx and generation-core using TypeScript 5.8.3.
- Focused Vitest was attempted, but this packaging environment has no complete `node_modules` / `vitest`; therefore the full npm gate is not marked PASS here.
- Synthetic overflow PDF smoke PASS: 80 rows split across two physical pages, table header repeated, post-table summary rendered once after the last row, final page tokens correct.
- Real saved Tax Invoice template overflow smoke PASS after final source sync: 54 item rows generated 3 physical pages, zero generation warnings, no table/summary/HSN/shape overlap on visual raster inspection, page 2 repeated the table header and rendered trailing summaries below the final table fragment, page tokens resolved as 1/3, 2/3, 3/3.

## Files primarily changed
- `apps/api/src/desktop-template-adapter.ts`
- `packages/renderer-pdf/src/pdf-renderer.ts`
- `packages/renderer-pdf/test/db6b-fix13-desktop-overflow.test.ts`

No API financial/formula contract behavior was intentionally changed by Fix13.
