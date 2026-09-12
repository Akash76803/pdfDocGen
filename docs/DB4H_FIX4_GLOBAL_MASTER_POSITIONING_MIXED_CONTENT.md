# DB-4H Fix4 — Global Master Positioning + Mixed Static/Dynamic Content

## Purpose
Close two Header/Footer authoring gaps found during manual QA:

1. Global Header/Footer master children must be positionable from any projected page, not only the source Builder Page.
2. Text-like content must support static text mixed with dynamic fields instead of forcing an all-or-nothing binding.

## Implemented

### Global master editing from any page
- Header/Footer projected elements can be selected, dragged and resized on any manual Builder Page or overflow continuation page.
- These are not independent copies: edits are written back to the single global master and synchronize to every output page.
- When page geometry differs, projected X/Y coordinates are normalized back to the master band.
- Selected Header/Footer elements include quick positioning actions: Left, Center, Right, Top, Middle, Bottom.

### Mixed static + dynamic text tokens
Any text-based Content editor can combine literal text with field tokens, for example:

`Invoice No: {{InvoiceNo}}`

`Customer: {{Customer}} | GSTIN: {{GSTIN}}`

`Page {{pageNumber}} of {{totalPages}}`

Field tokens resolve against the selected preview document/record. Page tokens resolve against the complete output-page sequence.

### Shared Content editor
The mixed-token editor is reused for:
- normal Text elements
- Header/Footer Text elements
- Shape text
- QR / Barcode text content
- Dynamic/Custom table text-cell content
- Dynamic body custom values
- custom Summary Row text

Whole-element binding remains available for simple use cases and backward compatibility. If a text template contains `{{...}}` tokens, mixed content is rendered from that template rather than being replaced by the whole-element binding.

## Safety
- Tables remain Body-only.
- Header/Footer children stay constrained inside their bands.
- Undo/Redo continues to treat drag/resize as gesture history.
- Existing templates without tokens render unchanged.
