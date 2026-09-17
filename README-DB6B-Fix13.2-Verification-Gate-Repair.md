# DB-6B Fix13.2 — Verification Gate Repair

Baseline: Fix13.1 local package prepared from Git main `5ec6dde6bab247ab365a566c0eef97a53cee0027`.

## User verification failures addressed
- TemplateBuilder document-formula helpers now use `NormalizedRecord[]` consistently, removing the remaining three `Record<string, unknown>[]` type mismatches.
- Current-document JSON body falls back to all source rows when item-level aggregate dependencies exist without a Parent / Document key, restoring multi-row aggregate payloads.
- Custom-table column insertion beside a merged cell expands the clicked merged `colSpan` as intended.
- Dynamic-table compact auto-height estimation was aligned with the existing pagination acceptance target so a 300px body can pack at least ten normal one-line rows while wrapped rows remain measured separately.
- Derived financial parity now normalizes explicit `Total GST` / `Final Amount` inputs into their canonical label/API-safe aliases without overwriting caller values, keeping grouped GST/document-formula resolution stable across casing/path variants.

## Verification performed in packaging environment
- TypeScript transpile diagnostics PASS for all modified TS/TSX files.
- Full workspace `npm ci` / `tsc -b` could not be completed in this packaging container because dependency installation timed out and left incomplete type packages.

## Local verification
Use Node 20 and run:

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

Then rerun the large overflow invoice API regression from Fix13.
