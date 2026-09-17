# DB-6B Fix13.3 — Final Verification Gate Stabilization

Baseline: local Fix13.2 package produced from Git main `5ec6dde6bab247ab365a566c0eef97a53cee0027` plus Fix13 pagination/reflow and Fix13.1/Fix13.2 gate repairs.

## Why another repair was needed
User-side full Node 20 verification showed that Fix13.2 had only two categories remaining:
1. Desktop formula aggregate props still exposed `Array<Record<string, unknown>>` at component boundaries, which is wider than `NormalizedRecord[]` and caused repeated TS2345 errors wherever document Formula Fields were evaluated.
2. The final generation-core parity test compared financial grouped sums using exact decimal literals. Binary floating-point accumulation could produce values such as `1406.8799999999999` even though PDF formatting displayed `1406.88`.

## Fix
- `CanvasElement`, `ElementContent`, and `Inspector` now type `formulaAggregateRows` as `NormalizedRecord[]` end-to-end.
- Financial derivation rounds row-level Total GST and Final Amount to currency precision.
- Generic grouped SUM/AVG and grouped formula arithmetic use stable high-precision normalization to remove IEEE-754 residue without forcing non-currency values to two decimals.
- No Fix13 Dynamic Table pagination/reflow renderer logic was changed.

## Verification expectation
On Node 20 with dependencies installed:
- `npm run typecheck` should clear the remaining TemplateBuilder TS2345 errors.
- `npm test` should clear the remaining generation-core GST precision test while preserving the 64 already-green suites.
- `npm run build` should no longer be blocked by the Desktop type errors.
