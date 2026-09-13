# DB-4F Fix3 — Unified Formula Binding Everywhere

## Goal
A created Global Formula Field must behave like a first-class Dynamic Field anywhere the builder already supports Custom Content, Field Binding, or Formula references.

## Implemented
- Normal Text / Shape / QR / Barcode / Header / Footer continue to use the existing unified Dynamic Field list.
- Table Text cells: Formula Fields are available in Custom Content token insertion and Field Binding.
- Table QR / Barcode cells: Formula Fields are available in Custom Content and Field Binding.
- Table Image cells: Formula Fields are available in Field Binding (useful when a Formula Field resolves to a compatible image source in future typed formula expansion).
- Custom Summary cells: Formula Fields are available as Custom Content tokens.
- Table row Formula editor: Global Formula Fields appear as references alongside imported fields and table formula columns.
- Summary Formula evaluation can resolve Global Formula Field scalar references.
- Runtime table rendering falls back from the current row/source value to the Global Formula Field value when a binding/token matches a Formula Field.
- Row fields intentionally win if a source field and Formula Field share the exact same name, preserving existing table semantics.

## Examples
- Text: `Grand Total: {{GrandTotal}}`
- QR custom value: `INV-{{InvoiceNo}}-{{GrandTotal}}`
- Barcode binding: `GrandTotal`
- Table custom cell: `Tax: {{TotalGST}}`
- Table formula: `[LineTotal] - [DocumentDiscount]` where `DocumentDiscount` is a Global Formula Field.

## QA
Verify the same Formula Field value in Body Text, Header/Footer, Shape text, QR, Barcode, Custom Table text, Dynamic Table custom/summary content, table binding, and table formula reference. Switch Preview Document and confirm all uses recalculate together.
