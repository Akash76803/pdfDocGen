# UX-5 — Complete Shape System

## Goal
Upgrade Shape from a simple filled rectangle into a reusable document container that can represent labels, badges, banners, arrows, callouts, flowchart shapes, media cards, dynamic text and conditional UI without disturbing existing templates.

## Inspector structure
Shape uses:
- Properties
- Content
- Formatting
- Conditions

## Shape Library
A searchable categorized picker is included with 39 presets across:
- Basic
- Arrows
- Badges & Labels
- Banners & Ribbons
- Callouts
- Symbols
- Flowchart

Presets include rectangle, rounded rectangle, circle, ellipse, triangle, diamond, pentagon, hexagon, arrows, chevron, bent arrow, tag, price tag, ticket, badge, seal, banner, ribbons, flag, bookmark, speech/thought/cloud callouts, star/heart/check/cross/plus and flowchart process/decision/document/database.

## Content
Shape content modes:
- None
- Text
- Media
- Text + Media

Text reuses the existing mixed static/dynamic token editor. Media supports local upload, URL/data URL and dynamic field binding.

Inner layout supports:
- media Left / Right / Top / Bottom / Background / Center
- media size
- content gap
- padding
- vertical alignment
- explicit Clip media to shape
- background-media opacity

## Formatting
### Fill
- None
- Solid
- Linear gradient
- Radial gradient
- Color 1 / Color 2
- Gradient angle
- Opacity

### Stroke
- None / Solid / Dashed / Dotted
- Width
- Color
- Inside / Center / Outside alignment

### Text
- Font family / size
- Bold / Italic / Underline
- Text color
- Horizontal alignment
- Vertical alignment
- Padding

### Media
Embedded media reuses Image-style controls:
- Contain / Cover / Stretch
- image position
- opacity / background
- border / radius
- brightness / contrast / saturation
- grayscale / sepia / blur
- media shadow
- background removal + Restore Original

### Shape effects
- Drop shadow
- Glow

## Conditions
Shape conditions are now functional, not placeholder-only. Supported operators:
- Equals
- Does not equal
- Contains
- Does not contain
- Is empty
- Is not empty
- Greater than
- Less than

Condition source fields are also included in the generated JSON input body when needed.

## Export fidelity
Advanced Shape geometry, media/effects and conditional visibility are guarded by the Native compatibility analyzer. Unsupported advanced styling automatically requires Exact Preview rather than silently degrading.

## Backward compatibility
All new Shape fields are optional. Legacy Shape elements continue to default to rectangle/text behavior and preserve existing text, fill, binding, geometry and flow placement.

## Verification performed
- TypeScript syntax transpile: PASS
  - TemplateBuilder.tsx
  - nativePdfGeneration.ts
  - templateJsonBody.ts
- CSS brace validation: PASS
- Shape Library preset count: 39
- Manual UI / functional QA: PENDING

Full workspace `npm run typecheck` is dependency-blocked in this container because the extracted source does not contain all workspace packages in node_modules. Run normal dependency install + project typecheck/build in the project environment before release.
