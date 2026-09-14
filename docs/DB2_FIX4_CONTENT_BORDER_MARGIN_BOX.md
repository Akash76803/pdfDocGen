# DB-2 Fix4 — Content Border Follows Margin Box

## Problem
The configurable page border from **Content Area & Appearance** was applied directly to `.document-page`, so it rendered on the physical paper edge (cut-to-cut). This also meant Preview/export could capture an unwanted edge border.

## Fix
- Removed the configurable border from the physical page canvas.
- Added `PageContentBorder`, an exportable/non-interactive border overlay positioned from the page margins (`top/right/bottom/left`).
- Border color and width continue to use the existing `PageSettings.borderColor` / `borderWidth` fields, so saved templates remain compatible.
- `borderWidth = 0` hides the content border.
- Margin / safe-area / bleed guides remain authoring guides and are unchanged.
- Renamed the inspector wording to **Content Area & Appearance**, **Content border**, and **Content border width** to make the behavior explicit.

## Expected behavior
If margins are 10 mm on all sides, the configurable border is inset 10 mm from every physical page edge. The paper itself remains borderless; only the content/margin rectangle receives the chosen border.

## Non-regression
No changes were made to Body Flow, pagination, Header/Footer, formula resolution, PDF generation, DOCX Exact, DOCX Editable, template storage, or generation orchestration.
