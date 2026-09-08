# Document Builder Extraction Baseline

Source repository: Akash76803/docGen
Frozen source commit: fac3e5867e92fd97a5c0b11bbf701bc78aebd1b7
Source version: 1.0.0-rc.2

This archive is a source extraction for the separate PDF/DOC Document Builder.

Included as application/runtime candidates:
- contracts/core
- template-engine
- calculation-engine
- datasource SDK/CSV/Excel
- grouping/mapping
- persistence
- renderer SDK/PDF/DOCX/image
- validation
- desktop template/generation pages and shared runtime folders

The existing design-engine is included under reference/design-engine only so document-safe
primitives can be selectively migrated. CAD, dieline, trimming, face-splitting and advanced
vector tooling should not become dependencies of the new product.

Important: this DB-0 archive is an extraction baseline, not yet a certified clean build.
The next step is dependency cleanup plus a fresh document-focused desktop router/editor shell.
