# UX-1 — Template Builder Toolbar + Page Setup Redesign

## Goal
Reduce visual crowding without removing existing Template Builder functionality. The phase applies progressive disclosure: frequent actions stay visible, export/integration actions move into menus, and advanced Page Setup controls stay collapsed until needed.

## Top toolbar
- Keeps Back, template title/status, Preview document picker, Preview, Save, Generate visible.
- Undo/Redo are compact icon actions.
- PDF / DOCX Exact / DOCX Editable are grouped under Export.
- JSON Body and New Template are grouped under More.
- Generate remains the primary CTA.

## Inspector
- Page selection exposes only Properties by default.
- Element selection exposes Properties / Data / Formatting / Conditions.
- Header and Footer are no longer permanent top-level tabs. They are managed from Page Setup and open dedicated master editors through Edit Header/Footer Content.

## Page Setup
Accordion groups:
1. Pages
2. Size & Orientation
3. Margins
4. Header
5. Footer
6. Bleed
7. Appearance

Pages and Size & Orientation are expanded by default. Advanced sections remain collapsed.

## Usability improvements
- Compact active-page actions menu replaces the large Duplicate / Up / Down / Delete row.
- Linked margins and bleed show one All Sides field; Independent mode exposes four edges.
- 0 mm and 3 mm bleed presets are available.
- Header/Footer explanatory paragraphs are replaced by contextual help icons.
- Header/Footer content editing is reachable directly from their Page Setup sections.
- Layout guides are presented as one clear toggle with a short description.
- Dark-theme and responsive toolbar behavior are preserved.

## Compatibility
No saved-template schema or renderer contract is changed. Existing page settings, header/footer masters, exports, JSON Body, Save/New, Generate, pagination, bindings, and document generation flows remain on their existing handlers.
