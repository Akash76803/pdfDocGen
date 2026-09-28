# UX-9 — Custom Table fit, typography, Shape border and image frames

Source baseline: `deploy/auth-ux2-cloud` after verified AUTH-UX-3 Desktop ↔ Cloud ↔ Salesforce PDF generation. Work is isolated on feature branch. **Do not deploy to the working Cloud Run revision or merge until output parity is verified.**

## Requirements and implementation

| Area | Requested behavior | Current source audit | UX-9 feature branch |
| --- | --- | --- | --- |
| Custom Table | End of last row aligns with table element bottom; no blank selection area; resizing/flow/pagination still works | `TableCanvas` previously published `shell.scrollHeight` even in Custom mode, which can include the outer fixed-height selection box | Use actual intrinsic table height plus visible ruler; avoid stretching the shell; regression test for stale wrapper height |
| Text typography | Editable font, size, weight, italic, underline, alignment, line-height, text color and background color | Existing text color and most typography already present; `fill` is included in native PDF text style but canvas did not render it as text background | Add optional transparent/background color selector and canvas display, preserving existing text style controls |
| Shape outline | Only user-configured stroke is printable; authoring selection should not look like a second actual border | Base CSS added a hardcoded `1px` Shape border *outside* the `shape-visual` custom border | Remove outer base border/padding; keep a distinct thin dashed selection indicator (export clone removes `.selected` and handles) |
| Image frames | Create rectangular, rounded and round/oval frame; crop/fit/focal placement and adjustable border | Standalone Image already supports editable border/radius/background/cover/contain/focal position; Shapes support media upload/binding, clip and fill Shape with Media | Expose frame presets in Image Formatting and retain existing controls |
| Zoom in/out *inside* frame | Zoom media 100–400% without changing frame dimensions, reset to 100% | No independent zoom property | Add `imageZoomPercent` to desktop model; apply CSS image transform inside existing clipped standalone Image and Shape media containers; expose controls in both inspectors |

## Acceptance QA

1. Custom Table with 1–20 rows, merged cells, images, selected/unselected states, content edits and page boundaries. Verify the measured height equals rendered rows/ruler, no empty region and no clipping. Check save/reopen and exact PDF.
2. Text with transparent and solid background; test text color, multiple fonts, bold/italic/underline, long wrapped lines and dynamic field tokens; compare canvas with exact PDF and Salesforce-generated native PDF.
3. Rectangle and rounded Shape with no border, inside/center/outside stroke, dashed/dotted stroke and selected/unselected; ensure one actual border and that authoring selection is not in exported PDF.
4. Standalone Image frame presets + border style/color/width, transparency, contain/cover/fill, focal position, zoom and reset. Shape Image clip with circle/rounded/polygon + zoom; test image URL, uploaded asset and bound image.
5. Save/reload template and generate Desktop exact and Cloud/Salesforce PDF from identical template and data. Visual diff including crop, edge clipping and typography.

## Release gate / known risk

Desktop screenshot/exact PDF uses browser canvas rendering. Cloud/Salesforce native output uses a separate rendering pipeline, where `imageZoomPercent` and Shape media need explicit parity validation. Do **not** claim image zoom is fully implemented in Cloud until its native renderer contract and all three export modes have passed. Existing Cloud Run and Gateway revision must remain unchanged during UX-9 QA.

## Delivery and status
- UI code and sizing regression tests in isolated feature branch.
- GitHub automated npm install/typecheck/unit tests/build.
- Pending: visual desktop QA, export/native parity, versioned template migration checks, Windows installer, user acceptance.


## UX-9.1 — Fit Image to Shape (user-requested 2026-09-26)

**User reference:** A leaf silhouette with content exactly constrained to the leaf. Deliver one action that transforms an existing Shape's image into a proportionally filled image masked by that Shape's actual boundary, rather than a second independent Image sitting on top of the Shape.

**Implementation committed on this draft branch:**
- New `Fit Image to Shape` in the Shape Properties and Shape Content inspectors. If there is no image, the action opens image upload; upload and fit are one operation. If an image source, asset or data binding already exists, the action immediately applies fit.
- Explicit `fitImageToShapePatch` resets fit to Cover, image position to Center, zoom to 100%, background media position, automatic Shape media clipping and no inner padding for image-only masks.
- Existing deliberately configured Text + Media preserves its text overlay and padding. Existing text-only placeholder switches to image-only.
- Existing shape visual masks the image at the Shape silhouette; rounded masks now use the configured Shape corner radius (instead of hardcoded 18px), preserving adjustable rounded Shape boundaries.
- Existing Shape move/resize preserves image as a child; original file and bindings are retained when applying fit to an existing image, and explicit new upload clears an obsolete image binding.
- Regression tests added for default conversion, intentional text overlay preservation, and repeatability of cover/center/zoom reset.

**Limits / quality gates:** This action uses the existing Shape preset paths (circle, rounded rectangle, star, arrow, badge, polygon, etc.); uploading an arbitrary leaf SVG *as a new Shape mask* is not implemented by this change. Custom user-imported path support would require an additional scoped phase. The browser/desktop rendering and exact canvas-captured PDF use the Shape masking path; Cloud/Salesforce native output uses a distinct renderer and **must not be declared identical** until separate backend mask support and E2E smoke pass. Do not merge/deploy or overwrite the proven Salesforce AUTH-UX-3 service for this draft.
