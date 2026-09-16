# DB-6B Fix4 — Clean API Request JSON

- JSON Body action now produces a complete ready-to-send `/api/v1/documents/generate` request.
- The active Template ID is included automatically.
- Imported/business labels are normalized to safe camelCase API paths (for example `Customer: Account Name` -> `customerAccountName`, `GST %` -> `gstPercent`).
- `items[]` uses the same normalized paths as the headless template adapter.
- Desktop template adaptation applies the identical path normalization so table/field bindings and copied request JSON stay in sync.
- Raw source lookup remains unchanged; only the external API contract uses normalized paths.
