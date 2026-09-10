# DB-4.4 Fix1 — Document ID Preview Picker

## Purpose
Replace technical `Record #N` labels in Template Builder → Dynamic Field → Preview with the configured business document identity from a Dynamic Table.

## Behavior
- The active page is inspected for a Dynamic Table bound to the active Data Source.
- Its configured `Parent / Document ID` field(s) become the preview document identity.
- Single key example: `Invoice No: INV-001`.
- Composite key example: `Invoice No + Company Code: INV-001 · COMP-A`.
- Repeated flat-source rows with the same parent key are collapsed to one preview document option.
- Selecting a document still stores the underlying first matching record index, so existing grouped-row filtering and dynamic field preview remain compatible.
- If no Parent / Document ID is configured, the picker safely falls back to the existing `Record #N` behavior.

## Scope
This is a UI/selection correction only. It does not change imported data, parent-key grouping semantics, or DB-4.4 pagination calculations.
