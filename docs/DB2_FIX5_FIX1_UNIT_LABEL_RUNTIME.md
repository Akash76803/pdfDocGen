# DB-2 Fix5 Fix1 — Page Properties `unitLabel` Runtime Crash

## Problem
After DB-2 Fix5, opening Template Builder rendered a blank page and React crashed with:

`ReferenceError: unitLabel is not defined`

The Border Offset label called `unitLabel(unit)` inside `PageProperties`, but `unitLabel` was not imported from `pageModel.ts`.

## Fix
Imported the existing `unitLabel` helper from `../lib/pageModel.ts` into `TemplateBuilder.tsx`.

No page geometry, border math, Formula, Flow, pagination, Bulk Generation, Template Management, PDF, or DOCX behavior was changed.

## Verification
- `TemplateBuilder.tsx` TypeScript transpile: PASS
- `pageModel.ts` already exports `unitLabel`: verified
- Regression target: Template Builder should render normally and the Border offset label should show `mm`, `cm`, or `in` according to Page Units.
