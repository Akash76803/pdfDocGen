# DB-5C Fix2 — Circular Generation Progress

## Scope
- Adds a circular percentage progress indicator to Bulk/Combined PDF generation on the Generate screen.
- Shows processed document count and percentage based on the persisted DB-5C bulk state.
- Running state uses the active progress ring; successful completion turns green; completion with failures turns red; paused state is neutral.
- Existing text progress, Retry failed / Retry combined batch behavior, DB-5C orchestration, Combined PDF logic, and renderers are unchanged.
- Includes dark-theme and responsive styling.

## Manual QA
1. Generate 4 separate PDFs in Bulk mode: ring should progress 0/25/50/75/100 as the Generate route is shown between items.
2. Generate a Combined PDF: the same ring should advance by invoice capture count and finish at 100%.
3. Force a failure: completed batch ring should be red and Retry action should remain available.
4. Successful batch: ring should finish green at 100%.

## Verification
- `Generate.tsx` TypeScript transpile: PASS.
- No generation-engine or renderer code changed.
