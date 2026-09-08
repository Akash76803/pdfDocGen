# DB-0 — Extraction Blueprint

Source repository: `Akash76803/docGen`
Target repository: `document-builder`

| Current area | Target area | Action | Notes |
|---|---|---|---|
| packages/contracts | packages/contracts | COPY | Shared contracts/types |
| packages/core | packages/core | COPY | Shared core logic |
| packages/template-engine | packages/template-engine | COPY | Primary document template engine |
| packages/calculation-engine | packages/calculation-engine | COPY | Formula/calculation support |
| packages/datasource-sdk | packages/datasource-sdk | COPY | Datasource abstraction |
| packages/datasource-csv | packages/datasource-csv | COPY | CSV import |
| packages/datasource-excel | packages/datasource-excel | COPY | Excel import |
| packages/mapping-engine | packages/mapping-engine | COPY | Field mapping |
| packages/renderer-sdk | packages/renderer-sdk | COPY | Export orchestration/contracts |
| packages/renderer-pdf | packages/renderer-pdf | COPY | PDF renderer |
| packages/renderer-image | packages/renderer-image | COPY | PNG/JPEG support |
| packages/validation | packages/validation | COPY | Validation |
| packages/persistence | packages/persistence | REVIEW + COPY | Remove Card/CAD/Packaging-specific persistence |
| packages/grouping-engine | document-design-engine or shared | REVIEW | Reuse only generic grouping behavior |
| packages/renderer-docx | packages/renderer-docx | EXTEND | Existing base exists but should be matured |
| packages/design-engine | packages/document-design-engine | SELECTIVE EXTRACTION | Only document-safe elements/features |
| apps/desktop/src/pages/Templates.tsx | apps/desktop/... | LOGIC REFERENCE | Do not copy huge UI wholesale |
| apps/desktop/src/pages/Generate.tsx | apps/desktop/... | LOGIC REFERENCE | Reuse generation behavior selectively |
| apps/desktop/src/pages/CardDesigner.tsx | none directly | DO NOT COPY WHOLE | Too large and CAD/design-specialized |

## Select from current design engine

Keep:
- text
- rich text
- images
- simple shapes
- transform
- alignment/distribution
- layers/groups
- dynamic binding
- QR/barcode
- basic artboard/page model
- lightweight snapping where useful

Do not migrate initially:
- CAD Line
- Polyline CAD behavior
- Construction Line / XLINE
- Ray
- CAD Arc
- Trimmer
- Scissors
- Split
- Fill Bucket
- Face splitting
- Advanced OSNAP
- Boolean geometry
- Node/Bezier editing
- Packaging dielines
- Panel mapping
- Packaging preflight
- advanced image background-removal tooling

## Recommended first implementation phases

1. DB-0 — Extraction and dependency cleanup
2. DB-1 — Fresh desktop shell + routing
3. DB-2 — Template engine integration
4. DB-3 — Data source integration
5. DB-4 — Document canvas/editor
6. DB-5 — PDF generation parity
7. DB-6 — DOCX renderer expansion
8. DB-7 — Bulk generation + API-ready service layer
