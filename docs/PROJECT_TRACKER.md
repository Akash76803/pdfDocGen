# Document Builder Phase Tracker

| Phase | Purpose | Scope | Status | Testing | Deliverable | Next |
|---|---|---|---|---|---|---|
| DB-0 | Source extraction | Reusable engines + selected desktop/template source from docGen | Complete | Extraction verified | DB-0 repo ZIP | DB-1 |
| DB-1 | Standalone shell | Clean document-only routes, A4 builder shell, CAD separation, workspace cleanup | Implemented | See verification section in DB1_STANDALONE_SHELL.md | DB-1 standalone ZIP | DB-2 editor wiring |
| DB-2 | Template editing | Core document elements, selection/transforms, properties, save/load | Planned | Not started | — | DB-3 data binding |

## DB-2 — Core Template Builder
- Purpose: Make the template canvas interactive and prioritize canvas workspace.
- Scope: Larger/collapsible workspace, element add/select/move/resize, basic inspector, local save/load.
- Status: Implemented in source.
- Testing: Static/typecheck/build verification pending environment dependency availability; manual smoke documented in DB2_CORE_TEMPLATE_BUILDER.md.
- Deliverable: Document-Builder-DB2-Core-Template-Builder.zip
- Next: DB-3 Dynamic Data Binding.


- DB-2 Fix1: Text alignment (Left/Center/Right) wiring corrected during manual QA. Pending user retest.
