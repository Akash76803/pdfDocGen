# Source Baseline

## Authoritative Git baseline for DB-6B Fix11
- Repository: `Akash76803/pdfDocGen`
- Branch: `main`
- Commit: `5f231615448db0671cc583f2d809461504ecf1b8`
- Commit message: `feat(api): complete PDF generation fidelity, custom tables, grouped summary, and typecheck/test fixes`
- Baseline date: 2026-09-16

The Fix11 local package was prepared from the source matching this Git commit. Key baseline blob hashes were verified against GitHub before modification, including:
- `packages/generation-core/src/desktop-parity.ts` → `cc9dd6277f780902f2f1718c07ae72370d7367ac`
- `packages/generation-core/src/desktop-formulas.ts` → `f92a0bcd2f5bbad7253bf6425d4b86efaa04e4ca`
- `packages/generation-core/src/index.ts` → `ebac82509cfad58ea8e0ebef9663e748c31944b7`
- `apps/api/src/desktop-template-adapter.ts` → `35500c25fe73559848fec91134488101f93221f1`

## DB-6B Fix11 local changes
Fix11 adds derived financial formula parity for API requests that omit redundant row totals:
- missing `Total GST` is derived from CGST + SGST + IGST, with Taxable × GST % as fallback;
- missing `Final Amount` is derived from Taxable + Total GST;
- explicit API values are never overwritten;
- derived values are materialized before grouped/HSN summaries and document Formula Fields.

Fix11 is local-only until the user explicitly requests a Git push. The delivered Fix11 ZIP becomes the authoritative local baseline after delivery.

## DB-6B Fix12 local changes
- Git source reference: `5d5105951d7513a4183e49806adec634dc1675f4` (latest `main` at implementation start).
- Clean API input contract: source leaves only; formula/table-calculated/summary/grouped/system outputs excluded; raw dependencies included recursively.
- Dynamic calculated-column canonical output aliases align with summary aggregate declarations for headless compatibility.
- Deliverable: `Document-Builder-DB6B-Fix12-Clean-API-Input-Contract.zip`.

## DB-6B Fix13 local changes
- Git source reference: `5ec6dde6bab247ab365a566c0eef97a53cee0027` (latest `main` verified at Fix13 implementation start).
- Dynamic Table overflow is now page-aware in the Desktop-native API renderer.
- Builder FLOW elements remain flow-aware through the API adapter; true floating elements remain absolute.
- Post-table summaries/HSN/shapes reflow after the runtime table end instead of overlapping long tables.
- Physical overflow continuations repeat table headers and global Header/Footer masters; deferred page tokens use the final physical page count.
- Deliverable: `Document-Builder-DB6B-Fix13-Dynamic-Table-Pagination-Post-Table-Reflow.zip`.

## DB-6B Fix13.1 local repair
- Source package: DB-6B Fix13, itself based on Git `main` commit `5ec6dde6bab247ab365a566c0eef97a53cee0027`.
- Repairs only the user-reported verification-gate regressions (types/tests/casing/test imports).
- Fix13 Dynamic Table pagination/post-table reflow implementation is intentionally preserved.
- Deliverable: `Document-Builder-DB6B-Fix13.1-Verification-Gate-Repair.zip`.

## DB-6B Fix13.3 — Final Verification Gate Stabilization
- Local baseline: Fix13.2 package derived from Git main `5ec6dde6bab247ab365a566c0eef97a53cee0027`.
- Formula aggregate rows are typed as `NormalizedRecord[]` end-to-end in TemplateBuilder component boundaries.
- Financial derivation and grouped aggregate/formula arithmetic normalize floating-point residue while preserving caller-supplied values.
- Fix13 Dynamic Table pagination/post-table reflow renderer logic is unchanged.
- Internal targeted verification: contracts/template-engine/generation-core TypeScript build PASS; actual compiled generation-core invoice parity smoke PASS; modified TS/TSX transpile PASS.
