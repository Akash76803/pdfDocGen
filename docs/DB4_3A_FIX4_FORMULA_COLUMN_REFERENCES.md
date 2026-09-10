# DB-4.3A Fix4 — Formula-to-Formula Column References

## Purpose
Allow a Dynamic Table formula column to reference the calculated result of another formula column.

## UX
The **Insert field** dropdown is grouped into **Imported Fields** and **Formula Columns**. The formula column currently being edited is excluded to prevent direct self-reference. Spaced labels insert with bracket syntax, for example `[Net Value]`.

## Evaluation
For every repeated runtime row, formula columns are evaluated in bounded dependency passes. Resolved formula results are exposed by column label/key to dependent formulas. This supports chains such as `Net Value` → `Tax Amount` → `Grand Total`. Self-references and circular dependencies remain unresolved/blank rather than crashing or running arbitrary JavaScript.

## Example
- Net Value: `[Basic Value] - ([Basic Value] * TD)`
- Tax Amount: `[Net Value] * [Tax Rate]`
- Grand Total: `[Net Value] + [Tax Amount]`

## Scope
DB-4.3A Fix4 covers Dynamic Table formula columns. Aggregate summary functions remain DB-4.3B.
