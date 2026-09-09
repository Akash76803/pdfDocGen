# DB-3 Fix1 — IndexedDB Persistence

## Issue
Large imported data sources failed when the complete `BuilderDataState` was serialized into localStorage.

## Resolution
`apps/desktop/src/lib/dataSourceStore.ts` now stores `BuilderDataSource[]` in IndexedDB and only small selection metadata in localStorage.

## Compatibility
- Existing DB-2 template localStorage is unchanged.
- Existing DB-3 localStorage data is migrated to IndexedDB when readable.
- `DataSources.tsx` and `TemplateBuilder.tsx` asynchronously hydrate IndexedDB state.

## Retest
1. Open Data Sources.
2. Import the CSV that previously caused quota exceeded.
3. Confirm field chips, record count and preview rows render.
4. Reload the page.
5. Confirm the source is still listed and data preview is restored.
6. Open Template Builder and confirm Dynamic Field can see the source.
