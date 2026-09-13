# DB-4B Fix4 — Move Shared Flow Row as One Unit

## Problem
Move Up / Move Down previously swapped only the selected Flow element with the adjacent Flow element in the persisted array. For a row containing 2–3 side-by-side blocks, this split the logical row and made it impossible to move the complete row above/below another block in one action.

## Fix
- Move Up / Down now operates on the selected element's **entire Flow row**.
- Every member with the same `flowRowId` moves together and retains its internal left-to-right order.
- Floating/non-Flow elements keep their existing array slots.
- `In Row ← / →` remains the dedicated control for changing order inside a shared row.
- Inspector labels become **Move Row Up / Move Row Down** whenever the selected row has multiple members.
- Shared-row height synchronization runs after the row move.

## Expected example
Before:
```
[ Address A ][ Address Text ][ Logo ]  <- shared row
[ HSN / Summary Table ]                <- next row
```
Move Row Up/Down treats the three blocks as a single document row.
