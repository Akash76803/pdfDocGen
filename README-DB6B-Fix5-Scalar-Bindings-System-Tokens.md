# DB-6B Fix5 — Scalar Binding Normalization + System Tokens

## Problem
DB-6B Fix4 normalized copied API request keys to safe camelCase paths, but older desktop template text tokens could still contain imported labels such as `{{Invoice No}}`, `{{Customer: Account Name}}`, `{{City}}`, and `{{Pin Code}}`. The headless TemplateEngine therefore generated `FIELD_VALUE_MISSING` warnings even though the clean request contained `invoiceNo`, `customerAccountName`, `city`, and `pinCode`.

`{{pageNumber}}` and `{{totalPages}}` were also being treated as if they were business request fields, which produced unnecessary missing-value warnings.

## Fix
- Desktop-to-headless adapter now normalizes mixed text tokens with the same `toApiSafePath()` contract used by Copy Request JSON and direct FIELD/TABLE bindings.
- Existing direct FIELD bindings remain normalized during desktop template adaptation.
- TemplateEngine rich-text resolution includes a backward-compatible safe-path fallback, so an older raw token can still resolve against the normalized request object.
- `pageNumber` and `totalPages` are system pagination aliases backed by `page.number` and `page.total`; they are no longer expected in external API request JSON and no longer generate missing business-field warnings.

## Examples
- `{{Invoice No}}` -> `{{invoiceNo}}`
- `{{Customer: Account Name}}` -> `{{customerAccountName}}`
- `{{Pin Code}}` -> `{{pinCode}}`
- `{{GSTIN}}` -> `{{gstin}}`
- `{{pageNumber}}` -> system pagination value
- `{{totalPages}}` -> system pagination value

## Verification
- `tsc -b packages/contracts packages/template-engine --pretty false` — PASS.
- Desktop template adapter standalone semantic TypeScript check — PASS.
- Runtime adapter + TemplateEngine smoke — PASS: normalized scalar bindings resolved with zero warnings, and system pagination tokens resolved without request data.
- Full `npm ci` was attempted but dependency transport timed out in the execution environment; full root typecheck/test/build remains a local/CI gate.
