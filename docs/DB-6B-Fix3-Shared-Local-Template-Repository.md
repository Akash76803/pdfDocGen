# DB-6B Fix3 — Shared Local Template Repository

Desktop and API now use the same local template repository by default.

## Windows default

`%APPDATA%/com.documenttool.app/templates`

The Tauri desktop app already persists `<template-id>.json` files in this folder. The API now checks the same folder first, so the Template ID shown in the Templates screen can be sent directly as `templateId`.

The API still checks `./data/templates` second so bundled development samples such as `example-invoice` continue to work.

## Overrides

- `API_TEMPLATE_DIR`: overrides the shared local template folder.
- `API_FALLBACK_TEMPLATE_DIR`: overrides the bundled/sample fallback folder.

## Desktop template adapter

Local desktop files are `TemplateLibraryEntry` JSON, not the canonical headless `TemplateDefinition` schema. The API repository detects those files and adapts supported Builder elements to a native/headless definition at load time. Core text, bound fields, divider, basic shapes, data-URL images/signatures and dynamic tables are supported by this adapter. Browser-only Exact rendering remains intentionally unavailable through the headless API.

## Browser/Vite development mode

A normal browser cannot write directly to AppData. When the desktop UI is running at the Vite URL instead of inside Tauri, template save/delete operations are mirrored through the local API at `http://127.0.0.1:8787/api/v1/templates/<templateId>`. The API writes the same AppData JSON files. If the API is not running, the browser remains localStorage-first and the sync is retried by later template saves/backfill.
