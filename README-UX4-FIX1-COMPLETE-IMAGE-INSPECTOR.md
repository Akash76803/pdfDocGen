# UX-4 Fix1 — Complete Image / Signature Inspector

This fixes the incomplete first UX-4 delivery and implements the full discussed Image/Signature inspector scope.

## Properties
- Image Source: upload/replace/remove, URL/data URL, dynamic binding, preview value
- Position & Size: X/Y/Width/Height + Lock aspect ratio
- Layout: Flow/Floating using existing document-flow behavior
- Fit & Crop: Contain/Cover/Stretch + image position (center/top/bottom/left/right)
- Region: Body/Header/Footer + repeat policy
- Advanced: layer/overlap, duplicate, delete

## Formatting
- Appearance: opacity, background, brightness, contrast, saturation
- Border: none/solid/dashed/dotted, width, color, corner radius
- Shadow: enable, X/Y, blur, spread, color, opacity
- Image Effects: grayscale, sepia, blur
- Background Removal: tolerance, edge softness, feather, fringe, noise cleanup, Remove Background, Restore Original

Background removal is non-destructive: it stores the original source reference and creates a processed PNG in the existing image asset store. The algorithm samples the corner background color and removes only border-connected matching pixels to reduce removal of light interior details.

## Rendering safety
Canvas/Exact Preview reflects all Image/Signature styling. Fast/Native compatibility now automatically routes templates using advanced image styling to Exact Preview so unsupported native styling is never silently lost.

## Verification performed
- TemplateBuilder.tsx TypeScript/TSX syntax transpile: PASS
- nativePdfGeneration.ts syntax transpile: PASS
- CSS brace validation: PASS
- Full workspace typecheck/build not executed because dependency installation in the execution environment was incomplete/timed out.

## Manual QA
1. Image tabs are Properties / Formatting / Conditions (no Data tab).
2. Upload, URL and dynamic binding all work.
3. Lock aspect ratio maintains proportions.
4. Flow/Floating and Region behavior remain unchanged.
5. Contain/Cover/Stretch + image position work.
6. Opacity/background/brightness/contrast/saturation preview correctly.
7. Border + radius preview correctly.
8. Shadow preview correctly.
9. Grayscale/Sepia/Blur preview correctly.
10. Background Removal produces transparent PNG and Restore Original works.
11. Save/reload preserves all settings.
12. Exact PDF preserves styling; Native Auto falls back when advanced styling is used.
