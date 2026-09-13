# DB-4F Fix2 — Single Formula Field Selector

## Problem
Formula Properties showed two field/source dropdowns: one under **Insert field** and another under **Insert aggregate**. Both represented the same imported source fields, which made the editor feel duplicated and confusing.

## Fix
- Formula Properties now has one **Reference field** dropdown.
- The same selection can be inserted directly with **Insert field**.
- For an imported field, choose SUM / COUNT / AVG / MIN / MAX and click **Insert aggregate**.
- Formula Field references remain available in the shared selector, but aggregate insertion is disabled for Formula Field references because aggregate scope is row-based over imported source fields.
- The Formula expression and evaluator are unchanged.

## Examples
- Reference field: Taxable → Insert field → `[Taxable]`
- Reference field: Taxable → SUM → Insert aggregate → `SUM([Taxable])`
- Reference field: TotalGST (Formula Field) → Insert field → `TotalGST`
