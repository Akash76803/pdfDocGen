# DB-4.6 — Number / Amount to Words

## Purpose
Add reusable Indian invoice amount-to-words conversion through the existing Global Formula Field engine.

## Formula functions
The following aliases are supported as whole Formula Field expressions:

- `NUMBER_TO_WORDS(expression)`
- `AMOUNT_IN_WORDS(expression)`
- `INR_WORDS(expression)`

Examples:

- `NUMBER_TO_WORDS([GrandTotal])`
- `NUMBER_TO_WORDS(SUM([Taxable]))`
- `NUMBER_TO_WORDS(SUM([Taxable]) + [TotalGST])`

For `216235.50`, the result is:

`Two Lakh Sixteen Thousand Two Hundred Thirty-Five Rupees and Fifty Paise Only`

## Behavior
- Indian numbering: Thousand, Lakh, Crore (with larger Indian scales supported for safety).
- INR wording: Rupee/Rupees, Paise, Only.
- Two-decimal rounding is applied before conversion.
- Zero, negative values and paise-only values are handled.
- Invalid/non-numeric inputs resolve safely to blank/null instead of throwing.
- Because the output is a Global Formula Field value, it is reusable anywhere Formula Fields already work: Text, Header/Footer, Custom/Dynamic/Grouped table content, QR, Barcode and other supported binding locations.
- Preview Document switching recalculates the words for the active Parent/Document context.
- Preview→PDF parity is inherited from the existing DB-4.5 rendering path.

## UI
Formula Field Properties now exposes an **Amount in words** button beside the shared Reference field selector. Selecting an imported field or Formula Field and pressing the button inserts `NUMBER_TO_WORDS(...)` automatically.
