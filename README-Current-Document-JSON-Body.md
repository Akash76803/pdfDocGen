# Current Document JSON Body Generator

This feature prepares the current Template Builder document for the upcoming ERP/API integration layer.

## Where it is
Template Builder top toolbar → **JSON Body**.

## What it generates
The modal scans every Builder Page and produces the external data body required by the current template:

- whole-element bindings
- `{{field}}` tokens inside text/shapes/QR/barcode content
- Dynamic Table body bindings
- Dynamic Table formula source dependencies
- grouped-summary source fields
- summary aggregate/formula source dependencies
- Custom Table bindings
- image/signature/media bindings
- Parent / Document key fields

Reusable **Formula Fields themselves are excluded** from the JSON payload because they are calculated by Document Builder. If a Formula Field depends on imported/source fields, those source fields remain part of the request contract because ERP must provide their inputs.

## Shape
Document/header fields are emitted at the root. Dot-path bindings are converted into nested JSON objects. Repeating Dynamic Table inputs are emitted under `items[]` and the currently selected document's matching source rows are used as sample values.

Example:

```json
{
  "InvoiceNo": "INV-1001",
  "Customer": {
    "Name": "ABC Traders"
  },
  "items": [
    {
      "ProductName": "Product A",
      "Qty": 2,
      "Rate": 500
    }
  ]
}
```

The modal also shows document-field count, item-field count, current item-row count, excluded Formula Fields, warnings, **Copy JSON**, and **Download .json**.
