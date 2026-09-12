# DB-4.4 Phase 3 — Pagination Hardening / Materialization

Status: Implemented / manual QA pending (2026-09-11)

## Purpose
Harden automatic pagination so business documents use the available body area efficiently and produce a deterministic page plan that preview and later PDF/DOCX renderers can share.

## Fix for reported footer-gap regression
The earlier planner used the design-time row handle height (typically 30/32 px) even when an auto-height table row rendered much shorter in the browser. The error accumulated across many invoice rows and could force rows onto a continuation page too early, leaving a large blank gap above the footer.

Phase 3 now estimates auto-height rows from the actual cell typography contract (font size × 1.25 line-height + vertical padding + collapsed border). Fixed-height rows still use their explicit row height. The planner therefore packs compact rows much closer to their real rendered size.

## Materialized table page plan
Every generated table page now includes:
- deterministic page identity
- exact runtime row start/end range
- header/summary inclusion flags
- available, used and unused height
- manual-break metadata

The same input table/data/geometry produces the same plan.

## Rules
- Page 1 uses remaining Header/Footer-aware body height from the table's rendered Y.
- Continuations use the full Header/Footer-aware body height.
- Repeat table header is accounted for on continuation pages.
- Summary rows can stay together and are emitted only on the final fragment.
- Oversized rows cannot create empty-page loops.
- Manual body break semantics are no longer repeated before every runtime row.
- No runtime rows are dropped while paginating.

## Scope boundary
This phase hardens and materializes dynamic-table pagination. Cross-page materialization of arbitrary DB-4B Body Flow rows/blocks and final PDF/DOCX parity will build on this page-plan contract.


## Fix1 — Footer hard-boundary protection
- Pagination capacity now reserves a 6px page-bottom safety guard before the Footer/content boundary.
- Auto-height row estimation includes an extra 1px browser/collapsed-border measurement allowance per rendered template row.
- Summary rows participate in the same guarded capacity check, so a subtotal/summary that cannot fit before the Footer moves to the next continuation page instead of entering the Footer zone.
- Goal: keep the earlier compact packing improvement while enforcing Footer as a hard non-overlap boundary.
