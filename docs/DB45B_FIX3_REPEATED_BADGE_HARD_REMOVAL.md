# DB-4.5B Fix3 — Repeated Badge Hard Removal

## Problem
The first export cleanup attempted to suppress the Header/Footer `Repeated` authoring badge only with an injected `::before`/`::after` CSS override. In html2canvas this was not reliable and the generated pseudo-element could still be captured in the PDF.

## Fix
The export clone now removes the `repeated-region-projection` authoring class directly from every repeated Header/Footer projection before html2canvas paints the cloned page. It also flips `data-repeated-projection` to `false` and keeps a defensive clone-only CSS pseudo-element suppression rule.

This changes only the cloned export DOM. The live Template Builder still shows `Repeated` as an authoring hint.

## Expected
- Editor: `Repeated` badge remains visible.
- Generated PDF: no `Repeated` pill/text on Header/Footer on any page.
- Header/Footer content, repeat policy, positioning and page numbering are unchanged.
