# Document Builder

Standalone PDF/DOCX business-document application extracted from `Akash76803/docGen`.

## Current phase

**DB-1 — Standalone Shell**

The active desktop app is intentionally document-focused. The historical Card Designer, CAD and packaging source is preserved under `reference/` and is not part of the active build.

## Run locally

Use Node 20 as required by the workspace:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

For the Tauri desktop shell:

```bash
npm run tauri:dev
```

## Active navigation

- Dashboard
- Templates
- Template Builder
- Data Sources
- Generate
- Settings

See `docs/DB1_STANDALONE_SHELL.md` and `docs/PROJECT_TRACKER.md`.
