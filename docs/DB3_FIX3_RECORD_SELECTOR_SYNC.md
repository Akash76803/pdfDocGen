# DB-3 Fix3 — Record Selector Sync

## Problem
DB3-T05 showed that changing Record 1 → Record 2 → Record 3 did not reliably change the visible preview or stay synchronized with Template Builder.

## Root cause
Record selection reused `saveDataState`, which rewrote all imported source records to IndexedDB before broadcasting the shared data-change event. That made a lightweight selection interaction unnecessarily asynchronous and delayed cross-view synchronization. The Data Sources preview also always showed the first 8 rows, so a selected record outside that window did not visibly change the preview.

## Fix
- Added `saveDataSelection()` for active source/record metadata only.
- Record changes write tiny metadata immediately and dispatch the shared data event without rewriting IndexedDB records.
- Source switching uses the same lightweight selection path.
- Data Sources shows a dedicated Selected Record preview.
- The tabular preview window follows and highlights the selected record.
- Template Builder record selector uses the same shared selection API.
- Selected record persists across navigation/reload through metadata.

## Retest
DB3-T05 must verify Record 1 → 2 → 3 on Data Sources, matching values in Template Builder, navigation persistence, and page reload persistence.
