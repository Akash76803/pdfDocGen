# DB-4.5B Fix2 — Table Border Style

## Scope
Adds document-level table border styling to Custom, Dynamic and Grouped Summary tables.

## Controls
- Style: Solid, Dashed, Dotted, Double, None
- Width: 0–10 px (0.5 step)
- Color picker
- Live border preview

## Behavior
- Border style applies consistently to all table cells and therefore follows the table through continuation pages.
- Existing templates without `borderStyle` safely default to `solid`.
- Grouped Summary reconfiguration preserves border style together with existing width/color.
- `None` removes visible borders while retaining table layout/content.
- Preview and PDF parity share the same CSS variable so PDF export receives the selected border style automatically.
