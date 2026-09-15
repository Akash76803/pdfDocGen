# UX-6 Fix1 — QR Runtime Import

## Problem
Opening or rendering a QR element crashed Template Builder with `ReferenceError: QRCode is not defined`.

## Root cause
UX-6 added the `react-qr-code` dependency and used `<QRCode />` inside `QrElementContent`, but `TemplateBuilder.tsx` did not import the component. The browser therefore resolved no runtime binding named `QRCode`.

## Fix
Added the missing default import:

```ts
import QRCode from 'react-qr-code';
```

No QR data model, inspector behavior, barcode behavior, signature behavior, persistence contract, or renderer pipeline was changed.

## Manual verification
1. Start Template Builder and add a QR element.
2. Confirm the builder no longer blanks/crashes.
3. Enter static text/URL and confirm the QR preview changes.
4. Insert an imported field/formula token and switch Preview Document; confirm QR updates.
5. Change foreground/background, quiet zone and L/M/Q/H error correction; confirm live preview updates.
6. Save/reload and confirm QR settings persist.
7. Add Barcode and Signature and confirm both remain functional.

## Regression scope
UX-6 QR / Barcode / Signature inspectors only; this is a minimal runtime-import correction.
