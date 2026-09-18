# UX-7 — Page-Level Watermark System

## Goal

Add reusable page-level watermarks without turning the watermark into a normal body element. The watermark is stored in page settings so it can automatically follow physical output pages created by dynamic-table pagination.

## Implemented scope

- Text watermark
- Image / logo watermark
- Enable / disable
- Opacity
- Rotation
- Text font size and color
- Image width scaling
- Positions: center, four corners, and custom X/Y percentages
- Page policy: all output pages or first output page only
- Layer policy: behind content or above content
- Live Builder preview
- Save / reload through PageSettings
- Native desktop PDF
- Headless/API PDF generation
- Dynamic-table continuation pages
- Batch separate PDF generation (through the existing single generation path)
- Combined PDF generation, including image resource namespacing

## Design decision

Watermark is a page-level setting rather than a regular canvas/body block. That prevents dynamic content reflow from moving it and avoids needing to duplicate watermark elements for continuation pages.

## PDF behavior

The native PDF renderer applies watermark operations only after pagination is finalized.

- **Behind content**: inserted after page background/border operations and before document content.
- **Above content**: appended after document content.
- Opacity uses a PDF ExtGState.
- Rotation uses a PDF transformation matrix.
- Image watermarks reuse the existing image preparation and combined-PDF resource namespacing paths.

## Compatibility

Existing templates remain compatible because missing watermark configuration is normalized to a disabled default.

Default:
- disabled
- text: `CONFIDENTIAL`
- 20% opacity
- -45° rotation
- centered
- 56px Builder font size
- applies to all pages
- behind content

## DOCX status

UX-7 verification covers Builder preview and PDF paths. Editable DOCX watermark parity is not part of this phase and should not be assumed until separately implemented and tested.

## Verification

Automated checks include:
- text watermark on multi-page output
- all-pages behavior
- first-page-only behavior
- PDF opacity resource
- image watermark embedding
- combined-PDF image resource namespacing
- full repository typecheck, test suite, and build gate

Branch: `feat/ux7-watermark-system`

Base: `feat/db6b-batch-combined-generation`
