# DB-3 Fix4 — Lazy Record Picker

## Problem
The DB-3 record selector rendered one native `<option>` for every imported record. Large CSV/Excel sources therefore created a large dropdown DOM tree and could make the UI feel heavy.

## Fix
- Added a shared custom `RecordPicker` component.
- Initial visible batch: **50 records**.
- Scrolling near the bottom appends the next **50 records**.
- Continues in 50-record batches until all records are reachable.
- The trigger always shows the currently selected record, while the dropdown list itself starts with only 50 rendered choices and grows in 50-record batches on scroll.
- Selection still uses DB-3 Fix3 lightweight metadata persistence; the full dataset is not rewritten.
- Applied to both **Data Sources** and **Template Builder** record pickers.

## Acceptance checks
1. Import a source with more than 150 records.
2. Open Preview Record: only the first 50 records should be rendered initially.
3. Scroll to the bottom: records 51–100 become available.
4. Scroll again: records 101–150 become available.
5. Select a record above 100 and verify Data Sources + Template Builder stay synchronized.
6. Navigate/reload and confirm the selected record is retained.
7. Verify a small source (<50 records) behaves normally.

## Scope note
This is incremental rendering of record choices, not dataset pagination. The datasource remains locally available through IndexedDB from DB-3 Fix1.
