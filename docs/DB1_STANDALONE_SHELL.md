# DB-1 — Standalone Document Builder Shell

## Baseline

Source extraction: `Akash76803/docGen` at `fac3e5867e92fd97a5c0b11bbf701bc78aebd1b7` (`1.0.0-rc.2`).

DB-1 turns the DB-0 extraction into a standalone document-focused workspace. The original Card Designer/CAD desktop source is preserved under `reference/desktop-legacy/src` for selective future migration and is no longer part of the active desktop build.

## Active product routes

- Dashboard
- Templates
- Template Builder
- Data Sources
- Generate
- Settings

There is no active Card Designer, CAD, dieline or packaging route.

## Template Builder shell

The builder now provides:

- A4 portrait page/canvas shell
- zoom in/out and fit control
- left element palette: Text, Image, Table, Shape, QR Code, Barcode, Signature, Divider
- document/page tree placeholder
- right inspector tabs: Properties, Dynamic Field, Formatting, Conditions
- top actions: Back, template name, Preview, Save, Generate

DB-1 intentionally does not implement element drag/drop, selection, persistence or renderer wiring. Those are DB-2+ tasks.

## Engine packages retained

- contracts
- core
- calculation-engine
- datasource-sdk
- datasource-csv
- datasource-excel
- grouping-engine
- mapping-engine
- persistence (document-safe exports active)
- renderer-sdk
- renderer-pdf
- renderer-docx
- renderer-image
- template-engine
- validation

## Design/CAD separation

The full historical `design-engine` remains under `reference/design-engine` only. Active application/package references to `@document-tool/design-engine` were removed.

Design-specific persistence repositories were moved to `reference/persistence-design`:

- design-template-repository
- indexeddb-card-repository
- artboard-preset-repository

Document template/settings/workspace/asset persistence remains active.

## DB-1 scope boundary

Not active in the new product:

- CAD Line / Polyline / XLINE / Ray / CAD Arc
- Trimmer / Scissors / Split / Fill Bucket
- Advanced OSNAP
- node/Bezier editing
- Boolean geometry / face splitting
- packaging dielines / panel mapping / packaging preflight

## Next phase — DB-2

Wire real template editing behavior into the clean shell:

1. document element model
2. add/select/move/resize Text/Image/Table/basic Shape/QR/Barcode/Signature/Divider
3. inspector property editing
4. dynamic field binding hooks
5. template save/load via the retained persistence/template engine
6. undo/redo foundation
7. preview contract for PDF/DOCX renderers

## Verification performed in the build environment

- DB-0 archive extraction: PASS
- active desktop route/source audit: PASS
- stale active `@document-tool/design-engine` references: PASS (none remain)
- stale root/workspace `packages/design-engine` references: PASS (none remain)
- `package-lock.json` reconciliation: PASS using `npm install --package-lock-only --offline`
- full dependency installation/typecheck/test/build: NOT COMPLETED in this environment because the runtime has Node 22 while the project requires Node 20, and the sandbox npm cache does not contain all required tarballs (for example `zod`). No source-level TypeScript failure was established from that dependency failure.

Run the documented Node 20 verification commands after extracting the ZIP in the normal development environment.
