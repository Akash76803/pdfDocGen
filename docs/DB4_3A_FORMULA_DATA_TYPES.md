# DB-4.3A — Formula + Data Type / Formatting Foundation

## Goal
Give Dynamic and Custom table text cells a business-document value pipeline:

`source/custom/formula value → data type → display format → canvas`

## Formula value mode
A text cell can use:
1. Custom Value
2. Field Binding
3. Formula

Formula example:

```text
Quantity * Rate - Discount
```

Evaluation is row-relative for Dynamic body rows and active-record-relative for Custom tables. Operators supported in 4.3A: `+ - * / ( )`.

## Data types
Text, Number, Decimal, Currency, Percentage, Date, Date Time, Time, Checkbox/Boolean.

## Formatting controls
- Decimal/Currency/Percentage decimals: 0–8.
- Thousands separator toggle.
- Currency code + symbol.
- Percentage Fraction/Whole interpretation.
- Date formats: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD MMM YYYY.
- Time: 12h or 24h.
- Boolean: checkbox glyphs or custom labels.

## Inheritance
Column Data & Format is the default. A selected text cell can override the column data type/format. Header rows remain ordinary text unless explicitly changed.

## Safety
Formula parse/evaluation failures render empty rather than executing arbitrary JavaScript. Divide-by-zero returns an empty value. Raw imported values are preserved.

## Manual QA
1. Dynamic Qty field → Number/Decimal formatting.
2. Formula cell `Quantity * Rate` → Currency ₹ with 2 decimals.
3. Percentage 0.18 → 18% using Fraction mode; 18 → 18% using Whole mode.
4. Date and Date Time pattern switching.
5. Boolean true/false → ☑/☐ and custom labels.
6. Save/reload retains value mode, formula, data type and format.
7. Switch parent/document record and verify formulas recalculate for each repeated row.
8. Invalid formula/divide-by-zero does not crash the builder.

## Deferred to DB-4.3B
SUM/AVG/COUNT/MIN/MAX, Subtotal, Tax, Discount and Grand Total summary-row formula configuration.

## DB-4.3A Fix1 — Dynamic formula value-type selection

Dynamic Table formulas can now be configured directly from **Column Structure → Data & Format → Body value type**. This removes the confusing dependency on selecting the body-template cell first. For a selected dynamic column, the body value type supports **Field binding**, **Formula**, and **Custom value**. Formula expressions are applied to every repeated runtime row for that column. Header cells remain label-only and now display guidance pointing users to the column-level body value controls. Result **Data type** and format remain independently selectable so a formula can render as Number, Decimal, Currency, Percentage, Date/Date Time/Time, or Checkbox where appropriate.

## DB-4.3A Fix2 — spaced field names + percentage formula semantics
- Formula references now support imported field names containing spaces. Existing expressions can use the readable raw field name when it exactly matches a record key, and the explicit safe syntax `[Basic Value]` / `[Special Product Discount]` is supported.
- Formula field chips automatically insert bracket syntax for field names that are not simple identifiers.
- Percentage-mapped fields are normalized for arithmetic: fraction mode keeps values such as `0.05`; whole mode converts `5` to `0.05`; literal strings such as `5%` are converted to `0.05`.
- Currency/decimal/number fields are converted to numeric values for arithmetic while display formatting remains independent.

Example:
`[Basic Value] - ([Basic Value] * (TD + [Special Product Discount]))`

## DB-4.3A Fix4 — Formula-to-Formula Column References
The Formula **Insert field** dropdown now includes a **Formula Columns** group in addition to Imported Fields. Selecting a formula column inserts a safe label reference such as `[Net Value]`. Per-row dependency passes resolve chained calculated columns; direct self-reference and circular chains remain blank safely.
