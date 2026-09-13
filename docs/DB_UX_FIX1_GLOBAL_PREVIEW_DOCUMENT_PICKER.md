# DB-UX Fix1 — Global Searchable Preview Document Picker

## Purpose
Move Preview Document / Preview Record selection out of the Dynamic Field inspector so it is globally available while the user works in Properties, Formatting, Conditions, Header, Footer, or any other builder area.

## Behavior
- The top builder toolbar shows **Preview document** whenever the active source is associated with a Dynamic Table that has Parent / Document ID keys.
- Parent rows are collapsed to one option per unique single/composite Parent key, preserving the existing document-context behavior.
- If no Parent key exists, the toolbar falls back to **Preview record**.
- The picker dropdown is searchable. Search filters the visible document labels (for example `Invoice No: INHI/2627/02667`) while retaining lazy loading for large lists.
- Changing the preview document updates the shared active record and resets the focused continuation page to the first preview page, so all dynamic text, tables, grouped summaries, formulas and pagination rebuild from the same context.
- The old Preview document control is removed from the Dynamic Field tab; that tab now focuses only on binding/token configuration.

## QA
1. Open any inspector tab and verify the preview selector remains available in the top toolbar.
2. Search by full or partial Invoice / Parent ID and select a result.
3. Verify all bound content and pagination update to the selected document.
4. Switch between Properties / Dynamic Field / Formatting / Header / Footer; selection remains global.
5. Test composite Parent IDs and a source without Parent keys (Preview record fallback).
