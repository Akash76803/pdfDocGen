# DB-6A — Template Input Contract + Schema

## Goal
Provide a stable, machine-readable contract describing exactly which raw values an ERP, Salesforce org, website, or other external system must send to Document Builder for a template.

## Rules
- External systems send raw source values only.
- Formula Field outputs are excluded from external input and remain calculated inside Document Builder.
- Dynamic table input is represented as `items[]`.
- Field metadata includes type, required/optional, nullable state and label.
- Image-bound fields declare support for URL, Base64 and data URL sources.
- The current JSON Body remains the example payload for the selected document.
- Contract version starts at `1.0` so future API changes can evolve safely.

## Builder UX
`More → JSON Body` now exposes both:
1. Current Document JSON Body — sample external request body.
2. Template Input Contract — stable integration schema/metadata.

The user can copy or download either artifact.

## Future API use
DB-6B/DB-6C can expose the same contract from:

`GET /api/v1/templates/{templateId}/schema`

The API server must reuse this contract logic rather than re-infer fields independently.
