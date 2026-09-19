# UX-8.1 — Universal Conditional Rendering Foundation

## Goal

Introduce one reusable conditional-rendering model for Builder elements while keeping the existing inspector UI language and renderer contracts.

## Implemented

- Universal Builder condition model:
  - enable/disable
  - Show when matched / Hide when matched
  - ALL (AND) / ANY (OR)
  - multiple rules
- Operators:
  - Equals / Not Equals
  - Contains / Does Not Contain
  - Starts With / Ends With
  - Is Empty / Is Not Empty
  - Greater Than / Greater Than or Equal
  - Less Than / Less Than or Equal
- Imported fields and Formula Fields share the same field picker.
- Current-record result shown in the Conditions inspector.
- Legacy `conditionEnabled / conditionField / conditionOperator / conditionValue` automatically normalize to the new model.
- Desktop preview uses the new multi-rule evaluator.
- Desktop-to-API adapter maps conditions to the existing renderer `VisibilityRule` contract.
- Header/footer/body-compatible renderer visibility contract is reused instead of duplicating condition logic.
- Tables receive top-level visibility in the API adapter.
- Existing inspector accordion, card, field, toggle and compact-button classes are reused for UI consistency.

## Data comparison behavior

- String matching is trimmed and case-insensitive by default.
- Numbers support comma-separated numeric input.
- ISO-like date strings are comparable.
- null / undefined / blank / whitespace strings are considered empty.
- zero and false are not considered empty.

## Architecture

Builder:
`BuilderConditionalRendering` -> preview evaluator

API:
`BuilderConditionalRendering` -> `VisibilityRule`

Renderer:
existing Template Engine conditional visibility engine removes hidden blocks before RenderModel layout.

This keeps Builder and generated PDF behavior aligned while preserving backward compatibility.

## Verification

Node 20.20.2 / npm 10.8.2:
- npm ci PASS (198 packages)
- typecheck PASS
- 68/68 test files PASS
- 364/364 tests PASS
- build PASS

## UX-8.2 — Conditional Body Flow & Pagination

Implemented:
- condition-false Body elements are removed before Body Flow materialization
- hidden Flow rows no longer reserve row height or before/after gaps
- following Flow rows collapse upward automatically
- Dynamic Table continuation planning runs only for visible elements
- Builder output-page count recalculates from the current record
- floating/header/footer conditional elements are skipped at the canvas render boundary
- element tree keeps conditional items addressable and shows a small current-state marker

Verification:
- typecheck PASS
- 68/68 test files PASS
- 365/365 tests PASS
- build PASS

## UX-8.3 — Conditional Design Aid & Global Watermark

Implemented:
- Canvas toolbar shows a Hidden count for elements whose conditions currently evaluate false.
- Hidden conditional elements stay outside the document-page export DOM and are exposed in a design-only strip for safe selection/editing.
- Selecting a hidden element opens its Conditions workflow without ghost content leaking into Exact PDF capture.
- Global Watermark supports the same universal Show/Hide, ALL/ANY and multi-rule condition model.
- Watermark conditions can use imported fields and Formula Fields.
- Builder preview evaluates conditional watermark visibility against the current record.
- PageWatermarkDefinition now carries an optional VisibilityRule.
- TemplateEngine evaluates watermark visibility against the same document context used for element conditions.
- API/headless generation maps Global Watermark conditions into the shared renderer visibility engine.
- Native PDF page definition carries the same Global Watermark visibility rule.
- Existing watermark all/first-page and behind/above behavior remains unchanged after visibility evaluation.

Verification:
- Node 20.20.2 / npm 10.8.2
- npm ci PASS (198 packages)
- typecheck PASS
- 68/68 test files PASS
- 367/367 tests PASS
- build PASS (2.73s)
- Tests cover Page Watermark condition evaluation and desktop-to-API watermark visibility mapping.

## UX-8.4 — Table Row/Column Conditions & Native PDF Parity

Implemented:
- Dynamic Table row-level conditions use the universal Show/Hide + ALL/ANY rule model.
- Hidden line-item rows are removed before table pagination and summary/rendering.
- Whole-column conditional rendering is supported with three scopes:
  - Document / header values
  - Any visible row matches
  - All visible rows match
- Hidden columns are projected out of the Builder table grid; no dead column space remains.
- Header/body/summary cells stay aligned after conditional column removal.
- Merged cell colSpan is reduced to the remaining visible columns.
- Renderer grouped-header colspan is recalculated from visible member columns.
- Renderer footer cells follow the visible column set.
- Row conditions and column conditions can use imported fields plus document Formula Fields.
- API/headless adapter maps row rules to `TableBlock.rowFilter` and column rules to `visibility + visibilityScope`.
- TemplateEngine evaluates row filters before row-scoped column visibility.
- Fast / Native PDF now carries universal element visibility, table row filters, conditional columns and Global Watermark visibility through the shared `VisibilityRule` contract.
- The old Native rule that forced all conditional elements to Exact Preview has been removed.
- Existing table inspector/card/toggle/button styling is reused for UI consistency.

Verification:
- Node 20.20.2 / npm 10.8.2
- npm ci PASS (198 packages)
- typecheck PASS
- 68/68 test files PASS
- 372/372 tests PASS
- build PASS (4.53s)
- CI also caught and fixed a projected-TableCanvas scope issue before the final clean run.

## UX-8.4 Fix2 — Conditional Table Auto Reflow

Implemented:
- Conditional columns are projected before Builder table pagination and height estimation.
- Remaining visible content columns redistribute the available table width proportionally.
- Intentional structural spacer columns keep their baseline width.
- Conditional row filtering is applied before pagination, so removed rows no longer reserve table height.
- `paginateDynamicTable` can consume the resolved conditional column-width plan for wrapped-row height estimation.
- Body Flow materialization now uses the conditional runtime table geometry instead of the original unfiltered table schema.
- The table's materialized fragment height therefore shrinks/grows with the visible rows and columns.
- Following Flow rows are positioned from the recalculated table height, preserving the configured gap below the table.
- Builder DOM height measurement is invalidated when resolved conditional column widths change.
- Existing outer table element width remains the layout boundary; only its internal visible-column distribution and runtime height reflow.

Verification:
- Node 20.20.2 / npm 10.8.2
- npm ci PASS (198 packages)
- typecheck PASS
- 68/68 test files PASS
- 377/377 tests PASS
- build PASS (4.52s)
- Regression tests cover proportional width reflow, spacer preservation, conditional-column height shrink and row-condition height shrink.

Manual visual smoke remains pending for the reported invoice cases.

## UX-8.4 Fix3 — Hidden Conditional Column Recovery UX

Implemented:
- Columns workspace now contains a permanent **All Columns** manager sourced from the original table schema.
- Columns remain selectable from the manager even when their condition currently hides them from the canvas/output.
- Selecting a hidden column restores its original schema cell selection, so the existing Column + Conditional Column inspector becomes editable again.
- Conditional columns show a dedicated **Conditional** badge in the manager.
- A one-click **Disable** action turns off the selected column condition without requiring the column to be visible on canvas.
- Disabling the condition immediately allows the normal conditional-render pipeline to bring the column back.
- Recovery selection does not mutate table rows/columns, widths or cell identities.
- No persistence-schema change was required; recovery uses the original table structure that already remains intact behind the projected runtime table.

Verification:
- Node 20.20.2 / npm 10.8.2
- npm ci PASS (198 packages)
- typecheck PASS
- 68/68 test files PASS
- 379/379 tests PASS
- build PASS (4.49s)
- Added regressions proving a conditionally hidden column can be selected from its original schema without structural mutation.

Manual UI smoke is pending.

## Next UX-8 work

UX-8.5:
- full manual visual/regression QA
- save/reopen persistence checks
- Exact PDF vs Native PDF comparison
- API single generation
- batch separate + combined PDF regression
- final PR #4 merge-readiness review