# DB-4G Fix2 — Grouped Final Summary Row

## Scope
Grouped Summary tables can now render one configurable final total row after all grouped output rows.

Calculation order:
1. Filter active Parent / Document.
2. Group source rows (for example by HSN).
3. Resolve grouped aggregate columns.
4. Resolve grouped Formula columns.
5. Calculate the Final Summary Row over the grouped output rows.
6. Format/render/paginate.

## Final Summary Row UI
Create and Edit use the same Grouped Summary configuration UI. The final row can be enabled/disabled and each output column supports:
- Blank
- Custom text
- SUM
- COUNT
- AVG
- MIN
- MAX
- FORMULA

A common GST layout is:
- HSN => Custom text `TOTAL`
- Taxable => SUM
- CGST => SUM
- SGST => SUM
- IGST => SUM
- Total GST => SUM
- Total => FORMULA `[Taxable] + [Total GST]`

## Pagination
The final row is a normal Dynamic Table summary row and therefore:
- renders only once on the final grouped page,
- participates in Keep Summary Together,
- respects the Footer hard boundary,
- moves intact to the next continuation page when necessary.

## Persistence
The row is stored in `customRows`, so summary configuration, formatting and formulas survive Save/Reload and are preserved when reopening the same Grouped Summary through Edit Configuration.
