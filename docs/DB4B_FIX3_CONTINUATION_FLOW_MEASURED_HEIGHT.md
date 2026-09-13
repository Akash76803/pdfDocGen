# DB-4B Fix3 — Continuation-page Flow measured height

## Root cause
The shared-row tallest-block logic itself was correct, but a normal Flow block that materialized on continuation page 2+ could not publish its measured DOM height. `TemplateBuilder` accepted `onLayoutChange` only when `virtualPageIndex === 0`. Therefore a Custom Table on a later physical page could visually gain rows while its persistent `element.height` stayed stale (for example 51px). Shared-row reservation then correctly used the wrong stale value, so the next row did not move.

## Fix
- Normal Flow blocks commit measured height regardless of the physical continuation page they land on.
- Only derived multi-page Dynamic Table fragments are blocked from writing their page-local fragment height back to the logical source element.
- Shared-row status now shows the selected block's measured height and the tallest reserved row height separately.
- Existing height dedupe / maximum-update-depth guard remains unchanged.

## Acceptance
Two side-by-side Custom Tables may live on any physical continuation page. Adding rows to either table must update that table's measured height, recompute the shared row max, and shift the following Flow row.
