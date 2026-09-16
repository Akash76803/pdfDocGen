# DB-6B Fix2 — Durable Local Template Files

Template Library entries are now mirrored from the desktop cache into JSON files in the Tauri application data `templates` directory.

## Behaviour

- Existing localStorage templates are backfilled to local JSON files when the Templates screen opens.
- New templates and Save operations write/update `<template-id>.json`.
- Rename, publish/archive, duplicate and version operations update the corresponding local JSON entry.
- Delete removes the local JSON file.
- On startup/opening Templates, local JSON files are merged back into the library cache, preferring the newest `updatedAt` value.
- A corrupt single JSON file does not prevent the remaining template library from loading.
- Browser-only Vite mode keeps the localStorage cache because browsers cannot write arbitrary local application files. Durable file persistence is active in the Tauri desktop runtime.

## Storage contract

The file contains the complete `TemplateLibraryEntry` including the stable template ID, metadata and Builder payload. The existing localStorage keys remain as a compatibility/cache layer for the current Builder and Generate flows.
