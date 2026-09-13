# DB-4.5C — DOCX Renderer Parity v1

## Goal
Make generated Word output consume the same DB-4.5A materialized physical-page sequence as Preview and PDF.

## v1 strategy: exact physical-page parity
Each materialized Preview page is captured at 192 DPI using the same export-cleanup path as PDF, then embedded as a full-page image in a Word section with the matching page size/orientation.

This guarantees that Word does not independently repaginate:
- Body Flow / shared rows
- Dynamic Table continuation boundaries
- Header/Footer repeat rules
- Formula Fields / Number-to-Words
- Grouped Summary / Final Summary
- Images / Signature / QR / Barcode
- Table border styles
- editor-chrome cleanup

Mixed page sizes and orientations are represented as separate Word sections.

## Important limitation
DB-4.5C v1 is fidelity-first: page content is rasterized and therefore is not individually editable/searchable as native Word text/tables. A later DB-4.5C v2 can map materialized blocks to native OOXML while preserving this same pagination contract.
