# DB-5D Fix1 — Fast Stable PDF Rendering

## Problem
Combined/Single PDF generation could fail with `Preview output page 2 is unavailable after waiting for layout.` and each invoice could spend several seconds waiting for layout stability.

## Fix
- Reduced stability timeout from 5s to 1.8s.
- Reduced stable observations from four to two, while still requiring real measurable Preview DOM pages.
- Reduced polling delays.
- Added final DOM-authority reconciliation: if pagination model and settled Preview disagree at timeout, the export manifest uses the physical pages actually materialized by React instead of requesting a stale phantom continuation page.
- Reduced materialized-page resolver timeout from 5s to 1.8s.

## Compatibility
No Formula, Body Flow, Pagination, PDF encoder, DOCX renderer or Combined PDF container logic was rewritten. The change is limited to generation render stabilization/manifest selection.
