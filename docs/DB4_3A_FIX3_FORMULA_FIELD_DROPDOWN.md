# DB-4.3A Fix3 — Formula Field Dropdown

## Problem
The Formula editor used a wrapping set of field chips. It became crowded, displayed only up to 12 numeric fields, and did not scale to large imported schemas.

## Fix
- Replaced formula field chips with one `Insert field` dropdown.
- The dropdown is populated from the selected table's active imported Data Source.
- Every detected source field is included, regardless of data type.
- Each option shows the display label/name plus detected type.
- Selecting a field inserts it into the Formula expression.
- Identifier-safe names are inserted directly; names containing spaces or other special characters are inserted using bracket syntax, e.g. `[Basic Value]`.
- After insertion, the dropdown resets so another field can be chosen immediately.
- The same picker is used for Dynamic column formulas and cell-level formulas.

## Formula behavior
The dropdown is a formula-authoring helper. Runtime formula validation remains responsible for determining whether the selected values are valid for the chosen arithmetic expression.

## Manual QA
1. Import a source with more than 12 fields and mixed types.
2. Select Formula mode.
3. Confirm all imported fields appear in `Insert field`.
4. Select `Basic Value`; confirm `[Basic Value]` is inserted.
5. Select `TD`; confirm `TD` is inserted.
6. Save/reload and verify the formula persists.
