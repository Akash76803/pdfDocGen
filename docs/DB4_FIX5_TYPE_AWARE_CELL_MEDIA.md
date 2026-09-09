# DB-4.1 Fix5 — Type-aware Table Cell Media

## Requirement
Custom table cells must not use a generic Content textbox for media cell types. Each cell type needs controls appropriate to its data.

## Implemented behavior

### Text
- Static Content
- Field Binding dropdown from the applicable imported Data Source

### Image
- Field Binding dropdown (image URL or `data:image/...` Base64)
- Choose/Replace local image file
- Remove image
- Image URL / data URL
- Fit: Contain / Cover / Stretch
- Binding overrides the manual image at preview/generation time
- Local image bytes are stored in IndexedDB; the table schema stores only `imageAssetId`

### QR Code
- Custom QR value
- Field Binding dropdown
- Binding overrides custom value

### Barcode
- Custom barcode value
- Field Binding dropdown
- Binding overrides custom value

## Binding context
- Custom Table: binding resolves against the currently active Data Source preview record.
- Dynamic Table body: binding resolves against each repeated runtime row.

## Shared properties
All cell types continue to support rowSpan, colSpan, padding, font size, alignment, background, save/reload, and stable cell IDs.

## Verification status
Source patch complete. Full monorepo typecheck is still blocked in the extraction environment by missing third-party dependencies and stale project-reference output paths. Manual UI QA is required.
