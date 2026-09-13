# DB-4.5A — Materialized Render Model v1

## Goal
Freeze the Builder's already-tested Body Flow + Dynamic Table pagination into one document-wide physical-page manifest. Export must not run a second pagination algorithm.

## Implementation
- Added `materializedRenderModel.ts`.
- Every Builder Page contributes its tested `outputPageCount` from the existing materializer.
- The model assigns stable document order, builder-page identity, continuation index, physical pixel size and physical millimetre size.
- Header/Footer page-number tokens continue to use the same document-wide output offsets already used by Preview.
- Exact PDF export iterates this manifest and asks Preview for the corresponding already-materialized physical page.

This is the first Render Page Model contract. Later DOCX/vector-PDF work can consume the same physical-page ordering rather than re-planning the document.

## Acceptance invariant
For builder-page output counts `[3, 1]`, the manifest is exactly `(page1,cont0),(page1,cont1),(page1,cont2),(page2,cont0)` with global document indexes `0..3`. A unit regression test records this invariant.
