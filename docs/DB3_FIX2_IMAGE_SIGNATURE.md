# DB-3 Fix2 — Image & Signature Media Elements

## Goal
Make Image and Signature real image-backed elements instead of generic text/content placeholders.

## Implemented
- Image and Signature no longer show the generic Content textarea in Properties.
- Local image upload from the Properties inspector.
- Replace image and remove image actions.
- Manual `https://...` or `data:image/...` source support.
- Fit modes: Contain, Cover, Stretch.
- Canvas renders the actual image/signature.
- Dynamic Field binding continues to override the manual image when the bound record contains an image URL or data URL.
- Missing/invalid image values fall back to the safe Image/Signature placeholder instead of crashing.
- Local image bytes are stored in IndexedDB (`document-builder-assets`) and the template stores only the asset ID, avoiding localStorage quota regression.

## Signature guidance
For the cleanest result, use transparent PNG/WebP signature artwork. Signature is treated as an image-backed semantic element, not plain text.

## Persistence
The selected local asset ID is saved with the existing DB-2 template payload. The actual Blob is persisted in IndexedDB.

## Verification note
The provided execution environment does not contain installed npm dependencies, so full typecheck/build cannot reach source validation. Run Node 20 `npm install`, `npm run typecheck`, `npm test`, and `npm run build` in the local Codex/Windows workspace.
