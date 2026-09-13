# DB-4F — Global Formula Element / Document Variables

## Purpose
Provide a reusable document-level calculation that can be placed visually as an element and referenced anywhere in document content.

## Implemented scope
- New **Formula** element in the Elements panel.
- Formula definitions are document-level and persist with the template.
- A Formula element can live in Body, Header or Footer and participates in normal Flow/Floating positioning.
- Multiple Formula elements can point to the same reusable formula variable.
- Formula variables can also be inserted as `{{FormulaName}}` tokens in Text, Shape text, QR/Barcode custom content and custom/summary table content.
- Current Parent / Document context is used for aggregate functions when a Dynamic Table parent key is available.
- Parent/Document preview switching recalculates formulas automatically.
- Formula definitions participate in editor Undo/Redo and Save/Reload.

## Formula syntax
Field or formula references use square brackets:

```text
[Taxable] + [TotalGST]
SUM([Taxable])
SUM([CGST]) + SUM([SGST]) + SUM([IGST])
ROUND([Amount] * 0.18, 2)
IF([Balance] > 0, [Balance], 0)
```

Supported functions:
- `SUM([Field])`
- `AVG([Field])`
- `MIN([Field])`
- `MAX([Field])`
- `COUNT([Field])`
- `FIRST([Field])`
- `ROUND(value, digits)`
- `ABS(value)`
- `IF(condition, yes, no)`

Supported operators: `+ - * /`, parentheses, and comparisons `> < >= <= == !=`.

## Reuse model
A definition such as:

```text
Name: GrandTotal
Expression: [TaxableTotal] + [TotalGST]
```

can be used as:

```text
{{GrandTotal}}
```

throughout the document.

## Formatting
Each formula variable supports Number, Decimal, Currency and Percentage formatting with configurable precision. Currency defaults to INR and can be changed in the Formula Builder.

## Safety
- Circular formula references are detected and surfaced in the resolved preview.
- Division by zero is trapped.
- Invalid syntax is shown without crashing the builder.
- Formula calculations are pure render-time calculations and do not mutate imported source data.
