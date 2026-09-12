# DB-4H Fix2 — Header / Footer Content Containers

## Goal
Make Header and Footer true reusable content containers rather than visual bands only.

## Implemented
- New **Add new content to** selector in Elements panel: Body / Header / Footer.
- Adding Text, Image, Shape, QR, Barcode, Signature or Divider while Header/Footer is selected places the element directly inside that band.
- Selecting Header/Footer as the insertion target automatically enables the band.
- Existing elements can still be reassigned with **Page Zone**.
- Header/Footer elements are constrained to their band for drag, resize and numeric X/Y/Width/Height property edits.
- Header/Footer geometry changes reflow child elements by preserving their local offset within the band and clamping them safely.
- The Header/Footer repeat setting applies to the **whole region composition**; all assigned child elements repeat as read-only projections on continuation pages.
- Repeated projections preserve each child element's normal content behavior and properties, including dynamic field binding and page-number tokens.
- Page-number text supports `{{pageNumber}}` and `{{totalPages}}` per virtual page.
- Tables remain Body-only.
- Element tree now marks Header (`H`) and Footer (`F`) children.

## Supported region content
Text, Image, Shape/Rectangle, QR, Barcode, Signature and Divider. Their existing formatting/binding/image properties remain available after region assignment.

## Repeat semantics
The repeat mode belongs to the Header/Footer region, not to an individual child. This keeps a composed header/footer synchronized as one unit:
- Every page
- First page only
- Except first page

## Persistence
No breaking schema migration is required. Region membership remains stored on each element; repeat policy remains stored in PageSettings. Existing templates continue to normalize missing regions to Body.
