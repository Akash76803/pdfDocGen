# DB-5B Fix1 — Generation Render Stability + Actionable Failure Details

## Problem
Single-document generation could succeed for one Parent/Document ID but fail for another with only the generic history message `Renderer reported a generation failure.` Large or continuation-page documents are more likely to expose the timing window because generation is launched by navigating from Generate to Template Builder while React, Flow measurement and table pagination are still settling.

## Fix
- Added a shared `resolveMaterializedPageNode()` resolver used by PDF, DOCX Exact and DOCX Editable.
- The resolver waits up to 5 seconds for the exact materialized Builder Page + continuation page DOM node to exist and have non-zero geometry before rendering.
- Added an extra paint before capture so auto-height/table measurement commits settle.
- Existing DB-4.5 PDF/DOCX rendering implementations remain unchanged; this is orchestration/readiness hardening only.
- Renderer catch messages are now preserved in DB-5B Generation History instead of being replaced by the generic failure message.

## Regression rule
Template Builder direct PDF / DOCX Exact / DOCX Editable exports continue to use the same renderer paths. No Formula, Body Flow, pagination or renderer engine was duplicated.
