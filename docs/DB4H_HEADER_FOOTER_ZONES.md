# DB-4H — Header / Footer Zones

Status: Implemented / manual QA pending.

## Scope
- Per-page Header and Footer zones with enable/disable, physical height, content gap and repeat mode.
- Repeat modes: Every page, First page only, Except first page.
- Header/Footer-aware `contentBoundsPx`: continuation tables begin after the header zone + gap and stop before the footer gap + zone.
- Page guides visualize Header and Footer zones.
- Non-table elements can be assigned to Body, Header or Footer from Properties. Tables remain in Body.
- Header/Footer elements repeat onto derived continuation pages according to repeat rules; repeated projections are not independently draggable.
- Text supports `{{pageNumber}}` and `{{totalPages}}` runtime tokens.
- Old saved templates normalize to disabled Header/Footer defaults.
- DB-5A history captures Header/Footer page-setting and zone-assignment changes.

## Phase boundary
This establishes page bands before DB-4.4 Phase 3 pagination hardening. Phase 3 will consume these content bounds for deterministic page plans, oversized-row policy and renderer page materialization.

## Fix1 — Zone assignment + repeat hardening
- Header/Footer can now be selected directly from an element's Page Zone even when the target band is disabled; choosing it auto-enables the band.
- Zone assignment clamps the element into the selected band and fits oversized width/height into that band.
- Header/Footer elements are constrained to their band during drag and resize so they cannot silently escape into Body content.
- A selected Header/Footer element exposes its zone repeat rule directly in Properties (`Every page`, `First page only`, `Except first page`).
- Continuation copies remain derived/non-editable projections; edit the source element on Page 1.
