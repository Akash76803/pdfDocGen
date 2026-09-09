# DB-3 — Data Source Import & Dynamic Field Binding

Status: **IMPLEMENTED — MANUAL TESTING REQUIRED**

## Goal
Connect the standalone Document Builder to real local structured data without reintroducing Card Designer/CAD dependencies.

## Implemented in DB-3
- Data Sources page now imports `.csv`, `.xlsx` and `.xls` files.
- Existing `datasource-csv`, `datasource-excel` and `datasource-sdk` packages are used for parsing/inference.
- JSON object/array paste import is supported.
- Imported data is normalized and stored locally for the DB-3 desktop workflow.
- Active source displays detected fields, inferred types, row count and first-row preview table.
- Active preview record can be changed.
- Template Builder Dynamic Field tab now shows a field dropdown from the active data source.
- Binding is stored on the selected template element and is persisted with the DB-2 template save model.
- Bound Text, QR, Barcode and Signature placeholders display the selected record value live on canvas.
- Bound Image displays an image when the data value is an HTTP(S) image URL or `data:image/...` URL; otherwise it shows the bound textual value/placeholder.
- JSON nested object paths are exposed as dot paths such as `customer.name`.

## Intentionally not included yet
- Repeating table/array rows — DB-4.
- Production generation pipeline and preview/export parity — DB-5+.
- Complex formula/conditional rules.
- Persistent database/server data sources.
- Advanced image upload/crop tooling.
- Excel multi-sheet chooser UI: DB-3 imports the detected/default visible sheet. Sheet selection can be added as a refinement.

## DB-3 manual test order
1. CSV import and field detection.
2. Excel import and field/date detection.
3. JSON import, including nested field paths.
4. Source switching/deletion.
5. Record selector.
6. Text field binding and live record preview.
7. QR field binding.
8. Barcode field binding.
9. Signature field binding.
10. Image URL/data-URL binding.
11. Save template, reload, verify bindings persist.
12. DB-2 regression: move/resize/properties/page setup/navigation.

## Verification note
The extraction environment currently runs Node 22 while the project requires Node 20. The dependency tree is not installed in the extraction sandbox, so the root TypeScript command stops on missing third-party packages (`react`, `xlsx`, `papaparse`, `zod`, etc.) before a clean full-project compile can be certified. Run the standard verification with Node 20 after `npm install` on the user's machine.

## DB-3 Fix1 — Large Data Source Persistence

During DB3-T01 manual CSV testing, importing a larger source could fail with:

`Failed to execute 'setItem' on 'Storage': Setting the value of 'document-builder.datasource.db3.v1' exceeded the quota.`

### Root cause
DB-3 initially persisted the complete imported source, including all records, into browser/Tauri `localStorage`. Large CSV/Excel files and Base64/data-URL values can exceed the WebView storage quota.

### Fix
- Full imported data sources are now persisted in IndexedDB (`document-builder-db3` / `dataSources`).
- `localStorage` now stores only lightweight active-source / active-record metadata.
- Legacy DB-3 localStorage payloads are migrated to IndexedDB when possible.
- Data Source and Template Builder hydration is asynchronous and reload-safe.
- DB-2 template persistence remains unchanged.

### Retest
Re-run DB3-T01 with the CSV that previously exceeded quota, then reload the page and confirm the source/records remain available.
