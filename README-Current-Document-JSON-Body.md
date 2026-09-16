# Current Document API Request JSON Generator

Template Builder → **More → JSON Body** now prepares a complete request for the headless REST API.

## Output
The primary textarea / **Copy Request** action returns a ready-to-send request for:

`POST /api/v1/documents/generate`

```json
{
  "templateId": "<active-template-id>",
  "output": {
    "format": "pdf",
    "fileName": "Tax-Invoice.pdf",
    "renderMode": "native-auto"
  },
  "data": {
    "invoiceNo": "INV-1001",
    "customerAccountName": "ABC Traders",
    "items": [
      {
        "productProductsName": "Product A",
        "quantity": 2,
        "unitPrice": 500
      }
    ]
  }
}
```

## API-safe paths
Imported labels are normalized to stable camelCase API paths. The same normalization is used by the desktop-to-headless template adapter, so copied request data and template bindings stay aligned.

Examples:
- `Customer: Account Name` → `customerAccountName`
- `Final Amount` → `finalAmount`
- `GST %` → `gstPercent`
- `TCS %` → `tcsPercent`
- `Product: Products Name` → `productProductsName`
- `Unit Price` → `unitPrice`

Dot notation remains nested (`Customer.Name` → `customer.name`). Formula outputs remain excluded because Document Builder calculates them internally.

The modal still provides the DB-6A Template Input Contract / schema separately.

## DB-6B Fix12 clean external-input contract

Copy Request now emits only source/external input fields and recursively resolves calculated outputs to their raw dependencies. Formula Fields, Dynamic Table calculated columns, aggregate/summary outputs, grouped synthetic outputs, and page-number system tokens are excluded from the request. The JSON Body modal lists all internally calculated outputs, and the Template Input Contract uses the same classification.
