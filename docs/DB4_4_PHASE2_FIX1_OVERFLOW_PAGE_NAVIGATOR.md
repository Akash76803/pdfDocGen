# DB-4.4 Phase 2 Fix1 — Overflow Pages in Pages Navigator

## Goal
Make automatic table-overflow continuation sheets visible in the Pages navigator so the page list matches the multi-page canvas preview.

## Behavior
- Persistent BuilderPages stay normal editable pages.
- The active BuilderPage exposes its derived continuation sheets directly beneath it.
- Continuation rows are labelled `Page Name · Continuation N` and carry an `Auto` badge.
- Clicking an Auto continuation focuses/scrolls the canvas to that derived sheet.
- Auto continuation sheets are not persisted and do not participate in Duplicate / Delete / Move actions.
- When the selected document has fewer rows, derived continuation entries disappear automatically.
- Selecting another persistent BuilderPage resets preview focus to that page's first sheet.

## Phase boundary
This fix improves navigation only. Continuation sheets remain runtime-derived pagination output rather than independent `BuilderPage` records.
