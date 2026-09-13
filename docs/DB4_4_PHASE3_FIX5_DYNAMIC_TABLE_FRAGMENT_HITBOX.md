# DB-4.4 Phase 3 Fix5 — Dynamic Table Fragment Height / Hitbox

## Problem
A multi-page Dynamic Table is one logical Body Flow element, but each virtual output page renders only one table fragment. The canvas wrapper was reusing the logical/persisted element height for every fragment. On continuation/final pages this could be much taller than the rows actually rendered. Because a selected table is raised in z-order and has a white table-element background, the oversized wrapper visually covered correctly-positioned blocks below it and intercepted clicks.

## Fix
For paginated Dynamic Tables, Template Builder now reads the materialized `TablePaginationPage.usedHeightPx` for the current fragment and uses that value as the **page-local canvas wrapper height**.

- Logical Flow/pagination span is unchanged.
- Table row placement is unchanged.
- Following blocks remain at their existing correct positions.
- Only the physical fragment selection/hitbox/background height is reduced to the rows rendered on that output page.
- A 32px minimum keeps an empty/very small fragment selectable.

## Expected behavior
Selecting a Dynamic Table on any continuation page highlights only that page's actual rendered fragment. Text, Custom Tables, Grouped Summary, images, signatures and other blocks below it remain visible and clickable.

## Regression focus
1. Multi-page Dynamic Table with a short final fragment.
2. Select the table on the final continuation page.
3. Confirm following Flow blocks do not disappear.
4. Confirm table pagination, subtotal/summary placement and Footer hard boundary are unchanged.
