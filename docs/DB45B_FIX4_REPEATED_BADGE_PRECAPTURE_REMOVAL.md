# DB-4.5B Fix4 — Repeated Badge Pre-Capture Removal

## Problem
Fix3 removed `.repeated-region-projection` from the html2canvas clone, but some Chromium/html2canvas paths still captured the CSS-generated `Repeated` pseudo-element. html2canvas can resolve generated pseudo content from the live document before the `onclone` hook runs.

## Fix
Before calling html2canvas for each materialized page:

1. Find live Header/Footer projection elements marked by `.repeated-region-projection` / `data-repeated-projection="true"`.
2. Temporarily remove the authoring class and set the data marker to `false` on the live DOM.
3. Wait one animation frame so generated pseudo-content is invalidated.
4. Capture the page.
5. Restore the exact original class/data state in `finally`, even if export fails.

The existing clone cleanup and defensive pseudo-element CSS remain in place as additional guards.

## Safety
This is a DOM-only export mutation; no React state, layout geometry, repeat policy, Header/Footer content, or persistence is changed. The editor badge returns immediately after each page capture.
