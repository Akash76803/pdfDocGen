# DB-6B Fix12 — Clean API Input Contract

Baseline: Git `main` commit `5d5105951d7513a4183e49806adec634dc1675f4`.

## Goal
Make Template Builder → JSON Body / Copy Request expose only the external values that an ERP/Salesforce/API caller must provide.

## Contract rules
- Source/external fields: INCLUDED when used by the template or required as a raw dependency.
- Formula Field outputs: EXCLUDED.
- Dynamic Table calculated-column outputs: EXCLUDED.
- Aggregate/Summary outputs: EXCLUDED.
- Grouped aggregate/formula synthetic outputs: EXCLUDED.
- System pagination fields (`pageNumber`, `totalPages`): EXCLUDED.
- Raw/leaf dependencies of any calculated field: INCLUDED recursively.

## Dependency behavior
The request builder now builds an internal calculation dependency graph. If a visible element references a calculated output, the output is not added to the request. Instead, its source dependencies are followed until real imported/source fields are reached. This also works across chained calculations.

Example:

`Taxable -> Discount -> Basic Value + Total Discount`

The request contains `basicValue` and `totalDiscount`; it does not contain `discount` or `taxableValue` when the table owns those calculations.

## Compatibility bridge
Calculated Dynamic Table columns now use the matching summary aggregate field as their canonical headless output path when available. This preserves legacy templates where a calculated column labelled `Taxable` is aggregated elsewhere as `Taxable Value`. A cleaned request can therefore omit `taxableValue` without breaking grouped HSN summaries or document totals.

## UI
The JSON Body modal now reports `calculated fields excluded` and lists internally calculated outputs, not only Formula Fields. The Template Input Contract `calculatedInternally` list uses the same expanded classification.

## Verification
- Modified TS/TSX transpile diagnostics: PASS.
- Focused request-contract runtime smoke: PASS.
- Real saved Tax Invoice clean Copy Request smoke: PASS; request contains source leaves such as Basic Value, Total Discount, GST %, CGST/SGST/IGST Amount, HSN, Quantity, Unit Price and product fields while omitting Discount, Taxable Value, grouped synthetic keys and pagination tokens.
- Real saved Tax Invoice adapter smoke: PASS; calculated Taxable canonical output becomes `taxableValue` from the summary declaration.
- Cleaned request -> actual adapter -> shared desktop-parity smoke: PASS; Taxable rows 1,584 / 1,736 / 4,496, grouped Taxable 7,816, Total GST 1,406.88 and grouped TOTAL 9,222.88.
- Full npm gate was not rerun in the packaging environment because dependency installation is unavailable there. The immediately preceding Fix11 baseline was user-verified with npm ci, typecheck, 343/343 tests, and full build PASS before these focused Fix12 changes.
