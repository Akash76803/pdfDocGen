# DB-6B Fix9 — Calculated Column Dependencies + Save Feedback

- Fixes headless/API parsing of formulas that reference another calculated table column, e.g. `[Basic Value] - Discount`.
- Save-time normalization persists the unambiguous form `[Basic Value] - [Discount]`.
- Function calls such as `DISCOUNT(...)` are preserved as functions.
- Headless table evaluation now exposes earlier calculated-column results to later formula columns in row order.
- Template Builder shows a visible “Template saved successfully” toast with local date/time and a persistent Last saved timestamp in the top bar.
