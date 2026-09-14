# DB-5D Fix3 — Generate Source Selectors

## Problem
The Generate workspace showed the active template as a read-only field, and the Data Source selector could appear disabled/unusable. Users could not switch the generation template directly from Generate.

## Fix
- Replaced the read-only Template field with a real template-library dropdown.
- Lists all non-Archived templates, including version and Draft indicators.
- Selecting a template switches the active legacy template contract used by Builder/Generate and refreshes generation validation immediately.
- If the selected template is bound to an imported source, Generate automatically prefers that matching source when available.
- Data Source remains selectable whenever Generate is not actively loading, even if there are currently zero sources.
- When there are no imported sources, the selector explains that data must be imported first and provides an `Open Data Sources` action.
- When there are no saved templates, an `Open Templates` action is shown.
- Bulk selections are cleared when the template changes so record IDs from one template/context are never reused accidentally.

## Compatibility
No renderer, pagination, Body Flow, PDF/DOCX, Combined PDF, formula, or imported-data persistence logic was changed.

## Verification
- `Generate.tsx` TypeScript transpile: PASS, 0 diagnostics.
- Source ZIP integrity: verify with normal unzip/test.
