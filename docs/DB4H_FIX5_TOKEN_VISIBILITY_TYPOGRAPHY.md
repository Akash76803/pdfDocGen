# DB-4H Fix5 — Multi-token visibility + Content Typography

## Why
Manual QA found that content containing multiple dynamic fields could remain unresolved, especially when imported field names already included brace characters. Content blocks also needed proper typography controls.

## Changes
- Canonical token insertion always writes `{{Field}}`, even if an imported field name contains braces.
- Legacy/malformed `{{{Field}}}` templates are normalized during runtime resolution.
- Token lookup accepts the imported field name or label, case-insensitively, while still reading the original record key.
- The Content editor now shows a live **Resolved preview** for the active document/record.
- Repeated token insertion keeps the caret after the inserted token so multiple fields can be composed reliably.
- Element typography now persists: Font Family, Font Size, Bold, Italic, Underline, Line Height, Text Color and Left/Center/Right alignment.
- Typography applies equally to static text and resolved dynamic token values.
- Existing templates migrate with safe typography defaults.

## Example
`Customer: {{Customer: Account Name}} | Country: {{Country}}`

renders as one mixed content block, preserving the static labels and styling while resolving both fields for the selected document.
