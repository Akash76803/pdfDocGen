# DB-6B Fix8 — DISCOUNT Formula Compatibility

Headless and desktop table formula engines now support:

`DISCOUNT(amount, discountRate)`

The function returns the net amount after discount. Both fraction and whole-percent rates are accepted:

- `DISCOUNT(1980, 0.20)` -> `1584`
- `DISCOUNT(1980, 20)` -> `1584`

This keeps invoice/table formulas consistent between the Builder preview and REST API generation. Formula parsing remains sandboxed and does not use JavaScript `eval`.
