# DB-4.2 Fix3 — Dynamic Table Field Mapping

## Problem
The Dynamic Table creation flow exposed structural count inputs that encouraged users to think repeated rows were manually created. For business documents such as invoices, quotations and POs, the number of dynamic body rows must come from imported line-item records.

## Correct workflow
1. Select one imported Data Source.
2. Select Parent / Document ID (single or composite).
3. Select Child / Row ID (single/composite, optional index fallback).
4. Configure columns. Each column has:
   - Header Label
   - Repeat Row Field selected from imported source fields
5. Create the table.

The table always starts with one header row and one body-template row. At runtime the body template repeats once for every source row in the selected Parent / Document group.

## Custom Table
Custom Table remains manual and continues to support Rows × Columns at creation time.

## Compatibility
The existing `createDynamicTable` API remains backward-compatible. Fix3 adds optional column mappings and uses them to initialize column labels, header-cell content and body-cell bindings.
