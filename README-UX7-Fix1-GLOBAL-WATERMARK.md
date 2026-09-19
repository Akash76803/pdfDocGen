# UX-7 Fix1 — Global Watermark System

## Goal

Promote the UX-7 watermark from page-specific behavior to one global document/template watermark.

## Global behavior

A template now has one effective watermark configuration. Changing the watermark from any page updates the watermark across every builder page.

The same global watermark is used for:
- Builder live preview
- Native desktop PDF
- Headless/API PDF
- Dynamic-table continuation pages
- Batch separate PDFs
- Combined PDFs

## Persistence and migration

Saved templates now persist a top-level `watermark` value.

Backward compatibility:
- If a saved top-level watermark exists, it is authoritative.
- If a legacy UX-7 template only has page-level watermark values, the first page watermark is promoted to the global watermark.
- The effective global watermark is synchronized back to every page settings object for compatibility with existing render and export paths.

## UI

The Page Setup inspector now labels this section **Global Watermark** and explains that it applies to the complete template rather than the selected page.

Supported controls remain:
- Text or image/logo
- Enable/disable
- Opacity
- Rotation
- Text font size and color
- Image scale
- Center / four corners / custom X-Y position
- All output pages / first output page
- Behind / above content

## Verification

Node 20.20.2 / npm 10.8.2:
- npm ci PASS
- typecheck PASS
- 67/67 test files PASS
- 357/357 tests PASS
- build PASS

Dedicated Fix1 tests verify:
- top-level global watermark overrides legacy page watermark
- legacy page-level watermark safely migrates when no top-level value exists

## Scope note

Editable DOCX watermark parity remains outside UX-7 / UX-7 Fix1.
