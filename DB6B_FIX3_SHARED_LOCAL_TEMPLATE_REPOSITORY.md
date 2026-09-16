# DB-6B Fix3 — Shared Local Template Repository

Authoritative local-first baseline after DB-6B Fix2.

- Desktop Tauri local templates: shared AppData `templates` folder.
- Browser/Vite dev mode: save/delete mirrors through local API `127.0.0.1:8787`.
- API reads shared local repository first, bundled `data/templates` second.
- Local desktop `TemplateLibraryEntry` JSON is adapted to the headless TemplateDefinition contract on read.
- UI Template ID can be used directly in the generation API after local sync/backfill.
