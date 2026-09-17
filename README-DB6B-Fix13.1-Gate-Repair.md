# DB-6B Fix13.1 — Verification Gate Repair

Baseline: DB-6B Fix13 package built from Git `main` commit `5ec6dde6bab247ab365a566c0eef97a53cee0027`.

This repair addresses local Node 20 verification failures reported after Fix13 packaging without changing the Dynamic Table pagination/reflow behavior.

## Repairs
- Restored explicit `test` imports in Vitest files that use top-level `test(...)`.
- Removed CommonJS `require(... ) as typeof import(...)` patterns from the ESM/Vitest table-model tests and use static imports instead.
- Tightened `TemplateBuilder` condition/formula helper typings to `NormalizedValue` / `NormalizedRecord`.
- Aligned API-safe test expectations to `totalGst`, matching `toApiSafePath("Total GST")` and the Copy Request contract.
- Aligned grouped-GST regression fixture to the same canonical `totalGst` key.
- Removed an accidental duplicate comment terminator in the generation parity source.

## Scope
No intended changes to Fix13 page measurement, Dynamic Table pagination, repeated table headers, post-table reflow, formulas, or API transport.
