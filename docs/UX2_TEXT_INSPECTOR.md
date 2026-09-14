# UX-2 — Text Element Inspector Redesign

## Goal
Reduce inspector crowding while keeping the most common Text tasks immediately discoverable.

## Text tabs
- Properties
- Formatting
- Conditions

The redundant Data tab is intentionally hidden for Text. Imported fields and Formula Fields are inserted directly from Properties → Content. The global Preview document picker remains the source of current record context.

## Properties
1. Content — text editor, field insertion, page tokens, resolved preview.
2. Position & Size — X/Y/Width/Height, with Flow-owned X/Y clearly disabled.
3. Layout — Flow/Floating selection; compact shared-row controls; advanced row actions behind Manage row.
4. Region — Body/Header/Footer assignment and repeat policy only when needed.
5. Advanced — layer/overlap plus Duplicate/Delete.

## Formatting
1. Typography — family, size, line height, Bold/Italic/Underline.
2. Text Alignment — explicit text-box alignment, clearly separated from row alignment.
3. Color & Spacing — text color and line height.
4. Effects & Auto Fit — reserved grouped location for renderer-safe advanced options; no unsupported document fields are introduced in UX-2.

## Compatibility
This phase is UI-only. Existing BuilderElement schema, token resolution, Body Flow contracts, header/footer masters, save/reload and renderers are unchanged.
