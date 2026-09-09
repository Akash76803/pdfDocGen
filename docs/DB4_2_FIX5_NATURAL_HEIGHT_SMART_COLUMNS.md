# DB-4.2 Fix5 — Natural Height + Smart Column Sizing

## Why
DB-4.2 Fix4 removed horizontal overflow, but the canvas table still used a fixed element height, which produced an internal vertical scrollbar. Equal/default width weights also left compact fields such as Quantity wider than their content required.

## Fix
- Table height is content-driven. The rendered table is measured and the builder element height follows the natural table height.
- Table shell no longer uses internal vertical scrolling. Dynamic rows expand the table naturally.
- Table resize changes width only; height remains automatic.
- Properties shows table Height as read-only `Auto`.
- Column widths are content-aware: header labels, design-time content and up to 40 runtime rows contribute to preferred width.
- Persisted Width remains a user preference/hint, but compact numeric/code fields receive less space than long description fields.
- Widths remain normalized to 100%, so horizontal table scrolling does not return.

## Acceptance
1. Dynamic Table with many line items has no internal vertical scrollbar.
2. Switching parent/document records grows or shrinks the table naturally.
3. Quantity/short code columns are narrower than long description columns when content warrants it.
4. All columns still fit the table/page width.
5. Column Width inspector still influences relative sizing without causing overflow.

Actual multi-page table pagination remains DB-4.4 scope.
