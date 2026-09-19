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

## Next UX-8 work

UX-8.3 / UX-8.4:
- richer design-mode visibility aid for hidden conditional elements
- conditional Global Watermark integration
- broader table row/column conditional behavior
- native Fast PDF parity review
