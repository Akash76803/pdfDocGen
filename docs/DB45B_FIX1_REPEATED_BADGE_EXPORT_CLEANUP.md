# DB-4.5B Fix1 — Repeated Header/Footer Badge Export Cleanup

## Problem
Header/Footer master projections intentionally show a small `Repeated` badge in the editor. The badge is created with the CSS pseudo-element `.repeated-region-projection::after`, so normal DOM cleanup during html2canvas export did not remove it and it appeared in the generated PDF.

## Fix
The exact Preview → PDF exporter now injects an export-only stylesheet into html2canvas' cloned document which disables the `::before`/`::after` pseudo-elements for repeated Header/Footer projections.

## Result
- Editor Preview still shows the `Repeated` badge as an authoring hint.
- Generated PDF contains the Header/Footer content only.
- No change to Header/Footer repeat behavior, page numbering, geometry or pagination.
