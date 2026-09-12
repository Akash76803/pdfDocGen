# DB-4H Fix6 — Body Positioning + Smart Placement

## Goal
Bring the same predictable positioning UX used by Header/Footer into the Body / Content region and stop newly-created elements from accidentally stacking on top of one another.

## Implemented
- Body quick-position controls: Left, Center, Right, Top, Middle, Bottom.
- Alignment is relative to the usable Body bounds after margins and Header/Footer reservations.
- Smart Insert for new Body elements scans the usable region for the first non-colliding position.
- New tables also seek a free vertical slot while keeping full usable Body width.
- Body drag/resize is constrained to the usable content region so elements remain reachable.
- Numeric X/Y/Width/Height updates are normalized to Body bounds through the shared region constraint helper.
- Manual overlap is still supported: users may intentionally drag elements over each other after insertion.
- Existing Header/Footer positioning and global-master behavior is preserved.

## Acceptance
- Adding several Text/Image/Shape/QR/Barcode/Signature/Divider elements should not place them all at the same coordinates while free Body space exists.
- Left/Center/Right and Top/Middle/Bottom should position selected Body elements against Body bounds, not physical page edges.
- Page size, margins, Header/Footer changes must keep Body elements inside the recalculated usable region.
