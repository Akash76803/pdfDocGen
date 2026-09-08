# Baseline Notes

Audit findings from the current `docGen` repository:

- Monorepo/workspace architecture is already suitable for selective extraction.
- Current product baseline is around Phase 9.4L–9.4M and includes SVG dieline import/manual panel mapping.
- Existing stable/shared engines include template, mapping, calculation, data source, PDF/image renderer, persistence and validation packages.
- A DOCX renderer package already exists, but it should be treated as an early/small implementation and expanded.
- The current Card Designer UI should not be copied as the new application's primary UI. Build a fresh document-focused editor.

This starter ZIP contains architecture and migration scaffolding only. It does not claim to contain a full clone of the current GitHub source.
