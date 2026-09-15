# UX-6 — QR / Barcode / Signature Inspector Redesign

## Scope
QR Code, Barcode and Signature now use the same focused inspector pattern:

`Properties | Content | Formatting | Conditions`

The old generic Data-tab workflow is removed for these three element types.

## QR Code
- Properties: position/size, Flow/Floating, Body/Header/Footer, layer/duplicate/delete
- Content: static text, URL, imported-field tokens, Formula Field tokens, resolved preview
- Formatting:
  - foreground color
  - background color
  - quiet zone
  - error correction L/M/Q/H
  - show/hide helper value
- Canvas now renders a real QR preview using the existing `react-qr-code` dependency.

## Barcode
- Current supported type remains Code 39.
- Content supports static text + dynamic tokens.
- Canvas now renders a real Code 39 bar preview rather than a placeholder icon.
- Formatting:
  - bar color
  - background
  - bar height
  - quiet zone
  - show/hide human-readable value
  - human-readable text size

## Signature
- Properties: position/size, aspect-ratio lock, Flow/Floating, region/layer controls
- Content:
  - upload / replace / remove
  - image URL / data URL
  - dynamic image-field binding
  - optional empty-design placeholder
- Formatting reuses the complete verified Image formatting system:
  - fit/position
  - opacity/background
  - border/radius
  - brightness/contrast/saturation
  - grayscale/sepia/blur
  - shadow
  - non-destructive background removal + restore

## Conditions
All three elements reuse the standard conditional-visibility engine.

## PDF fidelity
Native QR/Code39 generation remains available for standard rendering. Custom QR/Barcode styling is detected by Native compatibility checks and routes to Exact Preview so custom visual formatting is not silently lost. Advanced Signature styling already uses the same Exact fallback protection as Image.

## Verification
- `TemplateBuilder.tsx` syntax transpile: PASS
- `nativePdfGeneration.ts` syntax transpile: PASS
- CSS brace validation: PASS
- Full workspace typecheck: blocked in this source-only environment because project dependencies (`react`, `zod`, `xlsx`, `papaparse`, etc.) are not installed.
- Manual QA: PENDING (see updated tracker UX6-T01..UX6-T15)
