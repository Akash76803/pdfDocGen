# DB-4H Fix3 — Global Header / Footer Master

## Goal
Promote Header and Footer from page-local bands to document-level master regions so one composition can repeat across every manual Builder Page and every automatic overflow continuation page.

## Implemented
- Added dedicated `Header` and `Footer` inspector tabs beside Properties, Dynamic Field, Formatting and Conditions.
- The first Builder Page stores the canonical Header/Footer master elements; other Builder Pages render derived projections of those masters.
- Header/Footer settings (enabled, height, content gap, repeat mode) are synchronized document-wide.
- `Every output page`, `First output page only`, and `Except first output page` are evaluated against the complete generated document page sequence, not just one Builder Page's continuation stack.
- Header/Footer elements project onto separate manual pages and overflow continuation pages.
- Projected master content is read-only from non-master pages; edit the master via the Header/Footer tabs / source master elements.
- `{{pageNumber}}` and `{{totalPages}}` now resolve using the complete output page plan across all Builder Pages.
- Header/Footer content can still contain Text, Image, Shape, QR, Barcode, Signature and Divider. Tables remain Body-only.
- Existing page-local DB-4H saves migrate by taking the first Builder Page's Header/Footer configuration as the global master and removing duplicated band content from later Builder Pages.

## Design rule
Header/Footer are template masters, not manually duplicated page content. A generated document with multiple Builder Pages and/or table overflow pages receives the same master composition according to the selected repeat policy.

## Next
Manual QA: global repeat across separate Builder Pages, overflow pages, global repeat modes, page numbering, persistence and migration. After DB-4H closes, continue DB-4.4 Phase 3 pagination hardening/materialization.
