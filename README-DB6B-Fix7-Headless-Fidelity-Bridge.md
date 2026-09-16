# DB-6B Fix7 — Headless Fidelity Bridge

This patch closes the main fidelity gap between Template Builder and the headless REST API PDF path.

## What changed

- Desktop formula fields are preserved by the API template adapter and evaluated before TemplateEngine rendering.
- Formula references in normal field bindings and rich text are rewritten to `calc.<alias>` consistently.
- Raw business labels inside formulas continue to resolve against the normalized Copy Request JSON (`Final Amount` -> `finalAmount`).
- `NUMBER_TO_WORDS`, `AMOUNT_IN_WORDS`, `INR_WORDS`, arithmetic, and SUM/COUNT/AVG/MIN/MAX document formula patterns are supported by the headless formula bridge.
- Desktop x/y/width/height are preserved as absolute millimetre coordinates in the shared render contract.
- The native PDF renderer has a desktop absolute-layout path that draws blocks at their saved canvas coordinates instead of collapsing them into flow order.
- Static Builder image assets are materialized into self-contained data URLs when templates are mirrored to the shared local repository. Non-JPEG browser assets are normalized to JPEG when possible so the Node/headless PDF renderer can embed them reliably.
- Dynamic tables keep their saved start position and width while their rows are rendered from API data.

## Local repository / image migration

Existing template JSON files created before Fix7 can still contain only `imageAssetId`. The API cannot read browser IndexedDB. Open the template in the latest Builder and click **Save** once. The shared local JSON is rewritten with embedded `imageSource` data URLs.

## Fidelity boundary

Fix7 preserves page geometry and common text/field/table/image/box positions much more closely than the previous flow adapter. It is not a browser screenshot renderer: unsupported CSS-only effects, arbitrary web fonts, advanced shape geometry, blur/shadow filters, and some complex media effects can still differ from the live Builder canvas. Those should remain explicit native-renderer coverage items rather than silently claiming pixel-identical output.

## Verification performed

- contracts build PASS
- template-engine build PASS
- renderer-sdk build PASS
- renderer-pdf build PASS
- renderer-docx build PASS
- generation-core build PASS
- desktop-template-adapter standalone semantic TypeScript PASS
- changed source transpile/syntax PASS
- runtime fidelity smoke PASS:
  - raw-label formula -> normalized request key -> calculated output
  - formula-bound PDF text present
  - embedded JPEG emitted as a PDF image XObject and drawn
  - absolute x/y/width/height metadata preserved
  - PDF signature valid
- full root `npm ci` attempted but dependency transport hung/timed out in the execution environment; root typecheck/test/build therefore remain pending on the user's dependency-complete Node 20 environment.
