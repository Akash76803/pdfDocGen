# DB-4.4 Phase 3 Fix2 — Cross-page Body Flow Materialization

## Problem
A Body Flow element added after a Dynamic Table was positioned after the table's first-page design box. When the table overflowed to continuation pages, the new element could appear inside the first-page Footer zone instead of after the table's real final fragment.

## Authoritative rule
Body Flow follows logical document order across output pages, not just builder-page coordinates.

1. Materialize the complete output span of each preceding Flow block.
2. A paginated Dynamic Table reserves every page it consumes.
3. The next Flow row starts after the table's final fragment plus configured flow gap.
4. If that next block does not completely fit before the Footer hard boundary, it starts at the next page Body start.
5. Floating Body elements remain page-local and do not reserve Flow space.

## Example
Page 1: Header → Dynamic Table rows → Footer

Page 2: Header → remaining Dynamic Table rows → Subtotal → Text added after the table → Footer

If the Text cannot fit after the Subtotal on Page 2, it starts at the Body start of Page 3.

## Implementation
- `materializeBodyFlowPages()` adds output-page-aware Flow placement.
- Dynamic Table pagination plans provide page count and final-fragment used height.
- Virtual preview page count now includes downstream Flow blocks, not only table continuations.
- Non-table Flow blocks render on their materialized output page.
- Paginated table fragment indices remain relative to the table while page numbering remains document-global.

## Regression tests
- DB44-P3-T11: Flow block added after a multi-page table appears after its final fragment.
- DB44-P3-T12: Following block moves to next page when final-fragment remainder is insufficient.
