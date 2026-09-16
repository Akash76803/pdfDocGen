# DB-6B Fix11 — Derived Financial Formula Parity

Baseline: Git `main` commit `5f231615448db0671cc583f2d809461504ecf1b8`.

## Problem
The API request can legitimately omit redundant row totals such as `Total GST` and `Final Amount` while still supplying `Taxable Value`, `GST %`, `CGST Amount`, `SGST Amount`, and `IGST Amount`. The saved Desktop template aggregates `SUM([Total GST])` and `SUM([Final Amount])`, so headless generation previously resolved those document formulas to zero when the redundant fields were absent.

## Fix
The shared desktop-parity stage now materializes missing financial row aliases before grouped summaries and document formulas:
- `Total GST` = CGST Amount + SGST Amount + IGST Amount when tax components are available.
- Fallback: `Total GST` = Taxable Value × GST % when component amounts are absent.
- `Final Amount` = Taxable Value + Total GST when Final Amount is absent.
- Explicit values from the API caller are never overwritten.

The normal resolution order is now:
1. calculated Dynamic Table columns,
2. derived financial row aliases,
3. grouped/HSN summaries,
4. document Formula Fields,
5. TemplateEngine + PDF renderer.

## Tax Invoice acceptance target
For the current three invoice rows the headless model must resolve:
- Total GST: 1,406.88
- CGST: 703.44
- SGST: 703.44
- Net Payable: 9,222.88
- Grouped TOTAL: 9,222.88
- Final amount in words based on 9,222.88

A focused generation-core regression test covers the exact request shape where `totalGst` and item-level `finalAmount` are omitted.
