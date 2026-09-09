# DB-4.1 Fix1 — Repeat Source + Row Key Picker

## Problem
Dynamic Table creation exposed `Repeat source = items` and `Row key = id` as free-text/default values. That did not use the Data Sources already imported and verified in DB-3.

## Fix
- Dynamic Table **Repeat Source** is now a dropdown of loaded DB-3 Data Sources.
- Each option shows source name and record count.
- Dynamic Table **Row Key** is now a dropdown of headers/fields detected for the selected source.
- Stable identifiers (`id`, `lineItemId`, `uuid`, `guid`, `sku`, product code/code) are recommended when available.
- If no stable identifier is detected, the app does not guess an arbitrary first field; the user can choose one explicitly or use index fallback.
- The table binding persists `sourceId`, Repeat Source display name and `rowKey`.
- Runtime table rows repeat the entire selected source `records` collection.
- Changing Repeat Source from the Properties inspector refreshes the Row Key choices and applies a recommendation for the newly selected source.
- Legacy nested-array-path templates remain supported when no `sourceId` exists.

## DB-4.1 boundary
This fix does **not** implement header/column field mapping, formula columns, row/column CRUD or formula totals. Those remain DB-4.2 / DB-4.3 as frozen in the phase tracker.

## Manual acceptance
1. Import at least one CSV/Excel/JSON source in Data Sources.
2. Click Table → Dynamic Table.
3. Verify Repeat Source lists the loaded source(s) and record counts.
4. Select a source and verify Row Key lists its detected headers.
5. Choose a unique key and create the table.
6. Verify the table renders one runtime row per source record.
7. Select the table and switch Repeat Source in Properties; verify Row Key choices refresh.
8. Save/reload and verify source ID / Row Key remain selected and row identities are stable.

## UI hotfix — DB-4.1 Fix2
The Create Table modal was tightened after manual QA exposed horizontal overflow with long Data Source names. The modal now uses bounded two-column responsive fields, truncates long select labels safely, keeps numeric controls inside the modal, and preserves the footer actions without overlap.
