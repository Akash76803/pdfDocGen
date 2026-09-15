# DB-6A — Template Input Contract + Schema

Baseline: GitHub `Akash76803/pdfDocGen` main commit `7ddffa1463388ed30810a6b65140a94274b71c76` (latest verified Code Health PASS baseline before DB-6A).

This phase adds a stable external input contract on top of the existing JSON Body feature.

## Implemented
- Contract version `1.0`.
- Required vs optional input fields from source metadata.
- Nested document paths preserved.
- Dynamic table row inputs exposed as `items[]` collection fields.
- Formula Field outputs excluded from ERP/API input and listed under `calculatedInternally`.
- Image-bound inputs declare support for URL, Base64 and data URL values.
- Example payload reuses the current-document JSON Body.
- Builder JSON Body dialog exposes Copy/Download for both request body and input schema.
- Unit coverage added for document fields, collections, formula exclusion and image input metadata.

## Intended next use
DB-6B/DB-6C should reuse this same contract for `GET /api/v1/templates/{templateId}/schema` and request validation.
