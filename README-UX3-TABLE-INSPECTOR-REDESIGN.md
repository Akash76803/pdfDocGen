# UX-3 — Table Inspector Redesign

## Goal
Reduce inspector crowding and duplicate editing surfaces without changing the existing TableDefinition / BuilderElement schema or renderer behavior.

## UI structure
Dynamic/Custom Table selection now uses:
- Properties
- Columns
- Formatting
- Conditions

### Properties
- Position & Size
- Layout (Flow/Floating + shared-row controls)
- Region (Body / Content)
- Table identity / name
- Data Source / Document ID / Row ID
- Pagination
- Summary configuration
- Selected row structure
- Advanced object actions

### Columns
- Selected column label / width / min width / alignment
- Repeated body Value & Format (binding/formula/custom)
- Existing column sizing and add/move/duplicate/delete actions
- Selected cell content/media/value controls
- Cell override is clearly labeled as advanced rather than a second column default

### Formatting
- Table border style/width/color
- Selected cell local style: padding, font size, alignment, background
- Data format override under an advanced disclosure

## Duplication cleanup
- Table Data tab is presented as Columns for tables.
- Table-level data source settings no longer compete visually with column/cell settings.
- Table border no longer occupies Properties; it lives under Formatting.
- Row controls do not appear in Columns.
- Column/cell editors do not appear in Properties.
- Technical IDs are de-emphasized/hidden in normal table views.
- Existing binding/formula/media/summary controls are preserved; this is an inspector organization change, not a schema rewrite.

## Compatibility
No persistence schema, generation engine, dynamic table grouping, formula logic, pagination model, row/column manipulation helper or renderer contract was intentionally changed.

## Validation completed
- TemplateBuilder.tsx TypeScript/TSX syntax transpile: PASS
- app.css brace balance: PASS
- Manual UI/regression QA: PENDING
