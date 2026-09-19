import { describe, expect, it } from 'vitest';
import { addCustomSummaryRow, addTableColumn, addTableRow, applyGroupedFinalSummary, createCustomTable, createDynamicTable, createGroupedSummaryTable, deleteTableColumn, deleteTableRow, reconfigureGroupedSummaryTable, dynamicRows, evaluateTableFormula, evaluateTableSummaryRows, moveTableColumn, recommendedRowKey, updateTableCell, normalizeTableFormulaReferences, projectConditionalRuntimeTable, projectTableVisibleColumns, stableConditionalColumnWidths, visibleTableColumnIndexes } from './tableModel.ts';

describe('DB-4 table model', () => {
  it('creates a custom table with stable row/column/cell identities', () => {
    const table = createCustomTable(5, 8);
    expect(table.mode).toBe('custom');
    expect(table.columns).toHaveLength(5);
    expect(table.rows).toHaveLength(8);
    expect(table.rows.every((row) => row.cells.length === 5)).toBe(true);
  });

  it('creates a dynamic table and resolves runtime rows using rowKey', () => {
    const table = createDynamicTable(4, 'items', 1);
    const rows = dynamicRows(table, { items: [{ id: 'LI-1', name: 'A' }, { id: 'LI-2', name: 'B' }] } as never);
    expect(rows.map((row) => row.key)).toEqual([`${table.id}::LI-1`, `${table.id}::LI-2`]);
  });

  it('supports rowSpan and colSpan on both table modes', () => {
    const table = createCustomTable(3, 2);
    const cell = table.rows[0].cells[0];
    const updated = updateTableCell(table, cell.id, { rowSpan: 2, colSpan: 2 });
    expect(updated.rows[0].cells[0].rowSpan).toBe(2);
    expect(updated.rows[0].cells[0].colSpan).toBe(2);
  });

  it('adds a custom total row to a dynamic table', () => {
    const table = addCustomSummaryRow(createDynamicTable(5, 'items', 1));
    expect(table.customRows).toHaveLength(1);
    expect(table.customRows[0].cells[0].content).toBe('Subtotal');
    expect(table.customRows[0].cells[0].colSpan ?? 1).toBe(1);
  });
});

it('DB-4.1 Fix1 recommends stable row keys but does not guess arbitrary fields', () => {
  const { recommendedRowKey } = requireTableModelForTest();
  expect(recommendedRowKey([{ name: 'Name', label: 'Name', type: 'string' }, { name: 'lineItemId', label: 'Line Item Id', type: 'string' }] as never)).toBe('lineItemId');
  expect(recommendedRowKey([{ name: 'Name', label: 'Name', type: 'string' }] as never)).toBe('');
});

it('DB-4.1 Fix1 repeats a selected loaded Data Source and uses the chosen header as row key', () => {
  const { createDynamicTable: createDynamic, dynamicRows: rowsForTable } = requireTableModelForTest();
  const source = {
    id: 'source-1', name: 'Line Items.csv', sourceType: 'csv', warnings: [], importedAt: '2026-09-09T00:00:00Z',
    fields: [{ name: 'LineId', label: 'LineId', type: 'string' }],
    records: [{ LineId: 'L-1', Product: 'A' }, { LineId: 'L-2', Product: 'B' }],
  } as never;
  const table = createDynamic(4, 'Line Items.csv', 1, { sourceId: 'source-1', rowKey: 'LineId' });
  expect(rowsForTable(table, null, source).map((row: { key: string }) => row.key)).toEqual([`${table.id}::L-1`, `${table.id}::L-2`]);
});

function requireTableModelForTest() {
  return { recommendedRowKey, createDynamicTable, dynamicRows };
}

it('DB-4.1 Fix3 filters child rows by the selected parent record while keeping row identity separate', () => {
  const childSource = {
    id: 'invoice-lines', name: 'Invoice Lines', sourceType: 'json', warnings: [], importedAt: '2026-09-09T00:00:00Z',
    fields: [
      { name: 'LineId', label: 'Line Id', type: 'string' },
      { name: 'InvoiceId', label: 'Invoice Id', type: 'string' },
    ],
    records: [
      { LineId: 'L-1', InvoiceId: 'INV-001', Product: 'A' },
      { LineId: 'L-2', InvoiceId: 'INV-002', Product: 'B' },
      { LineId: 'L-3', InvoiceId: 'INV-001', Product: 'C' },
    ],
  } as never;
  const parentSource = {
    id: 'invoices', name: 'Invoices', sourceType: 'json', warnings: [], importedAt: '2026-09-09T00:00:00Z',
    fields: [{ name: 'Id', label: 'Id', type: 'string' }], records: [{ Id: 'INV-001' }],
  } as never;
  const table = createDynamicTable(4, 'Invoice Lines', 1, {
    sourceId: 'invoice-lines', rowKey: 'LineId', parentSourceId: 'invoices', parentKey: 'Id', childForeignKey: 'InvoiceId',
  });
  const rows = dynamicRows(table, { Id: 'INV-001' } as never, childSource, parentSource);
  expect(rows.map((row) => row.key)).toEqual([`${table.id}::L-1`, `${table.id}::L-3`]);
});

it('DB-4.1 Fix4 groups a flat source by a selected parent/document field', () => {
  const source = {
    id: 'invoice-flat', name: 'Invoice Export', sourceType: 'csv', warnings: [], importedAt: '2026-09-09T00:00:00Z',
    fields: [
      { name: 'InvoiceNo', label: 'Invoice No', type: 'string' },
      { name: 'LineItemNo', label: 'Line Item No', type: 'string' },
    ],
    records: [
      { InvoiceNo: 'INV-001', LineItemNo: '10', Product: 'A' },
      { InvoiceNo: 'INV-001', LineItemNo: '20', Product: 'B' },
      { InvoiceNo: 'INV-002', LineItemNo: '10', Product: 'X' },
    ],
  } as never;
  const table = createDynamicTable(4, 'Invoice Export', 1, {
    sourceId: 'invoice-flat', parentKey: 'InvoiceNo', parentKeys: ['InvoiceNo'], rowKey: 'LineItemNo', rowKeys: ['LineItemNo'],
  });
  const rows = dynamicRows(table, { InvoiceNo: 'INV-001', LineItemNo: '10' } as never, source);
  expect(rows.map((row) => row.key)).toEqual([`${table.id}::10`, `${table.id}::20`]);
});

it('DB-4.1 Fix4 supports composite parent and child row identities in one source', () => {
  const source = {
    id: 'invoice-flat', name: 'Invoice Export', sourceType: 'csv', warnings: [], importedAt: '2026-09-09T00:00:00Z',
    fields: [],
    records: [
      { Company: 'A', InvoiceNo: '001', LineItemNo: '10' },
      { Company: 'A', InvoiceNo: '001', LineItemNo: '20' },
      { Company: 'B', InvoiceNo: '001', LineItemNo: '10' },
    ],
  } as never;
  const table = createDynamicTable(4, 'Invoice Export', 1, {
    sourceId: 'invoice-flat', parentKeys: ['Company', 'InvoiceNo'], rowKeys: ['InvoiceNo', 'LineItemNo'],
  });
  const rows = dynamicRows(table, { Company: 'A', InvoiceNo: '001' } as never, source);
  expect(rows.map((row) => row.key)).toEqual([`${table.id}::001¦10`, `${table.id}::001¦20`]);
});

it('DB-4.2 adds and deletes custom rows while preserving unaffected row IDs', () => {
  const table = createCustomTable(3, 2);
  const firstId = table.rows[0].id;
  const selectedCell = table.rows[0].cells[0].id;
  const added = addTableRow(table, selectedCell, 'below');
  expect(added.rows).toHaveLength(3);
  expect(added.rows[0].id).toBe(firstId);
  const deleted = deleteTableRow(added, added.rows[1].cells[0].id);
  expect(deleted.rows).toHaveLength(2);
  expect(deleted.rows[0].id).toBe(firstId);
});

it('DB-4.2 adds a dynamic table column without manually adding runtime body rows', () => {
  const table = createDynamicTable(3, 'Invoice Export', 1);
  const bodyRowId = table.bodyRows[0].id;
  const added = addTableColumn(table, table.bodyRows[0].cells[1].id, 'right');
  expect(added.columns).toHaveLength(4);
  expect(added.bodyRows).toHaveLength(1);
  expect(added.bodyRows[0].id).toBe(bodyRowId);
  expect(added.bodyRows[0].cells).toHaveLength(4);
});

it('DB-4.2 expands and contracts colSpan when columns are inserted/deleted inside a merged cell', () => {
  let table = createCustomTable(3, 2);
  const mergedCell = table.rows[0].cells[0];
  table = updateTableCell(table, mergedCell.id, { colSpan: 2 });
  const added = addTableColumn(table, mergedCell.id, 'right');
  expect(added.columns).toHaveLength(4);
  expect(added.rows[0].cells[0].colSpan).toBe(3);
  const deleted = deleteTableColumn(added, added.rows[0].cells[0].id);
  expect(deleted.columns).toHaveLength(3);
  expect(deleted.rows[0].cells[0].colSpan).toBe(2);
});

it('DB-4.2 blocks column reorder while merged colSpan cells exist', () => {
  let table = createCustomTable(3, 2);
  table = updateTableCell(table, table.rows[0].cells[0].id, { colSpan: 2 });
  const ids = table.columns.map((column) => column.id);
  const moved = moveTableColumn(table, table.rows[0].cells[0].id, 1);
  expect(moved.columns.map((column) => column.id)).toEqual(ids);
});

it('DB-4.2 Fix3 creates dynamic columns from header labels and imported repeat fields', () => {
  const table = createDynamicTable(2, 'Invoice Export', 1, { sourceId: 'invoice-flat', parentKey: 'InvoiceNo' }, [
    { label: 'Product', field: 'ProductName' },
    { label: 'Qty', field: 'Quantity' },
  ]);
  expect(table.headerRows).toHaveLength(1);
  expect(table.bodyRows).toHaveLength(1);
  expect(table.columns.map((column) => column.label)).toEqual(['Product', 'Qty']);
  expect(table.headerRows[0].cells.map((cell) => cell.content)).toEqual(['Product', 'Qty']);
  expect(table.bodyRows[0].cells.map((cell) => cell.binding)).toEqual(['ProductName', 'Quantity']);
});

describe('DB-4.2 Fix4 normalized table widths', () => {
  it('normalizes arbitrary column widths to 100 percent', async () => {
    const { normalizedColumnWidths } = await import('./tableModel.ts');
    const table = createDynamicTable(3, 'items');
    table.columns[0].width = 120;
    table.columns[1].width = 240;
    table.columns[2].width = 120;
    const widths = normalizedColumnWidths(table.columns);
    expect(widths.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 8);
    expect(widths[1]).toBeCloseTo(50, 8);
  });

  it('falls back safely for invalid saved widths', async () => {
    const { normalizedColumnWidths } = await import('./tableModel.ts');
    const table = createCustomTable(2, 1);
    table.columns[0].width = 0;
    table.columns[1].width = Number.NaN;
    expect(normalizedColumnWidths(table.columns)).toEqual([50, 50]);
  });
});


describe('DB-4.2 Fix5 smart table sizing', () => {
  it('allocates less width to compact quantity values than long descriptions', async () => {
    const { createDynamicTable, smartColumnWidths } = await import('./tableModel.ts');
    const table = createDynamicTable(2, 'rows', 1, undefined, [
      { label: 'Description', field: 'description' },
      { label: 'Quantity', field: 'qty' },
    ]);
    const widths = smartColumnWidths(table, [
      { description: 'TATA 1210D FRONT LEAVES WITH 70 4th AMI', qty: 2 },
      { description: 'SUSP. SPR. B6Y00701/02 & B6Y02801/02', qty: 4 },
    ]);
    expect(widths).toHaveLength(2);
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(Math.round(widths[0] + widths[1])).toBe(100);
  });
});

describe('DB-4.3A formula and data type formatting', () => {
  it('evaluates row-level arithmetic formulas from imported fields', async () => {
    const { evaluateTableFormula } = await import('./tableModel.ts');
    expect(evaluateTableFormula('Quantity * Rate - Discount', { Quantity: 2, Rate: 500, Discount: 50 })).toBe(950);
    expect(evaluateTableFormula('(Quantity * Rate) / 2', { Quantity: 2, Rate: 500 })).toBe(500);
    expect(evaluateTableFormula('Quantity / Zero', { Quantity: 2, Zero: 0 })).toBeNull();
  });

  it('formats decimal, currency, percentage, date and checkbox values', async () => {
    const { formatTableValue } = await import('./tableModel.ts');
    expect(formatTableValue(1250.5, 'decimal', { decimals: 2 })).toContain('1,250.50');
    expect(formatTableValue(1250.5, 'currency', { decimals: 2, currencySymbol: '₹' })).toContain('₹1,250.50');
    expect(formatTableValue(0.18, 'percentage', { decimals: 0, percentInputMode: 'fraction' })).toBe('18%');
    expect(formatTableValue('2026-09-09', 'date', { dateFormat: 'dd/MM/yyyy' })).toBe('09/09/2026');
    expect(formatTableValue(true, 'checkbox', { checkboxStyle: 'checkbox' })).toBe('☑');
  });

  it('stores inferred data types on dynamic mapped columns', () => {
    const table = createDynamicTable(2, 'Invoice Export', 1, undefined, [
      { label: 'Qty', field: 'Quantity', dataType: 'decimal' },
      { label: 'Invoice Date', field: 'InvoiceDate', dataType: 'date' },
    ]);
    expect(table.columns.map((column) => column.dataType)).toEqual(['decimal', 'date']);
  });
});


describe('DB-4.3A Fix4 formula-column references', () => {
  it('exposes other formula columns but excludes the current formula column', async () => {
    const { createDynamicTable, formulaColumnReferences } = await import('./tableModel.ts');
    const table = createDynamicTable(3, 'rows', 1, undefined, [
      { label: 'Basic Value', field: 'Basic Value', dataType: 'currency' },
      { label: 'Net Value', field: 'Net Value', dataType: 'currency' },
      { label: 'Tax Amount', field: 'Tax Amount', dataType: 'currency' },
    ]);
    const body = table.bodyRows[0];
    body.cells[1].valueMode = 'formula'; body.cells[1].formula = '[Basic Value] * 0.9';
    body.cells[2].valueMode = 'formula'; body.cells[2].formula = '[Net Value] * 0.18';
    const refs = formulaColumnReferences(table, table.columns[2].id);
    expect(refs.map((ref) => ref.label)).toEqual(['Net Value']);
    expect(refs[0].reference).toBe('[Net Value]');
  });

  it('evaluates chained formula columns in dependency order', async () => {
    const { createDynamicTable, evaluateTableFormulaColumns } = await import('./tableModel.ts');
    const table = createDynamicTable(3, 'rows', 1, undefined, [
      { label: 'Basic Value', field: 'Basic Value', dataType: 'currency' },
      { label: 'Net Value', field: 'net', dataType: 'currency' },
      { label: 'Tax Amount', field: 'tax', dataType: 'currency' },
    ]);
    const body = table.bodyRows[0];
    body.cells[1].valueMode = 'formula'; body.cells[1].binding = undefined; body.cells[1].formula = '[Basic Value] * 0.9';
    body.cells[2].valueMode = 'formula'; body.cells[2].binding = undefined; body.cells[2].formula = '[Net Value] * 0.18';
    const result = evaluateTableFormulaColumns(table, { 'Basic Value': 1000 });
    expect(result[table.columns[1].id]).toBe(900);
    expect(result[table.columns[2].id]).toBe(162);
  });

  it('leaves circular formula-column dependencies unresolved', async () => {
    const { createDynamicTable, evaluateTableFormulaColumns } = await import('./tableModel.ts');
    const table = createDynamicTable(2, 'rows', 1, undefined, [
      { label: 'A', field: 'a', dataType: 'decimal' },
      { label: 'B', field: 'b', dataType: 'decimal' },
    ]);
    const body = table.bodyRows[0];
    body.cells[0].valueMode = 'formula'; body.cells[0].binding = undefined; body.cells[0].formula = 'B + 1';
    body.cells[1].valueMode = 'formula'; body.cells[1].binding = undefined; body.cells[1].formula = 'A + 1';
    expect(evaluateTableFormulaColumns(table, {})).toEqual({ [table.columns[0].id]: null, [table.columns[1].id]: null });
  });
});


describe('DB-4.3B Fix1 summary row cell structure', () => {
  it('creates one default summary cell per current table column', () => {
    const table = addCustomSummaryRow(createDynamicTable(5, 'items', 1));
    expect(table.customRows).toHaveLength(1);
    const summary = table.customRows[0];
    expect(summary.cells).toHaveLength(5);
    expect(summary.cells.map((cell) => cell.colSpan)).toEqual([1, 1, 1, 1, 1]);
    expect(summary.cells[0].content).toBe('Subtotal');
    expect(summary.cells[4].summaryMode).toBe('aggregate');
    expect(summary.cells[4].summaryName).toBe('Subtotal');
  });

  it('lets users merge summary label cells afterwards using colSpan', () => {
    let table = addCustomSummaryRow(createDynamicTable(5, 'items', 1));
    const summary = table.customRows[0];
    table = updateTableCell(table, summary.cells[0].id, { colSpan: 4, content: 'Grand Total' });
    const updated = table.customRows[0];
    expect(updated.cells).toHaveLength(5);
    expect(updated.cells[0].colSpan).toBe(4);
    expect(updated.cells[0].content).toBe('Grand Total');
  });
});

describe('DB-4.4 Phase 3 pagination hardening', () => {
  it('packs compact auto-height rows using rendered typography instead of 30px design handles', async () => {
    const { paginateDynamicTable } = await import('./tableModel.ts');
    const table = createDynamicTable(4, 'items', 1);
    // Default 11px font + 5px padding estimates to ~25px, so a 300px body should fit
    // materially more rows than the old fixed 30px planner and avoid a large footer gap.
    const rows = Array.from({ length: 20 }, (_, index) => ({ key: `row-${index + 1}`, value: { id: index + 1 } as never }));
    const pages = paginateDynamicTable(table, rows, 300, 300);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0].runtimeRows.length).toBeGreaterThanOrEqual(10);
    expect(pages[0].unusedHeightPx).toBeLessThan(30);
  });

  it('keeps a hard footer-boundary reserve for body rows and summary', async () => {
    const { paginateDynamicTable, addCustomSummaryRow } = await import('./tableModel.ts');
    const table = addCustomSummaryRow(createDynamicTable(4, 'items', 1));
    table.pagination.keepSummaryTogether = true;
    const rows = Array.from({ length: 24 }, (_, index) => ({ key: `row-${index + 1}`, value: { id: index + 1 } as never }));
    const pages = paginateDynamicTable(table, rows, 300, 300);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.usedHeightPx).toBeLessThanOrEqual(page.availableHeightPx);
    }
    expect(pages[pages.length - 1]?.includeSummary).toBe(true);
  });


  it('moves a wrapped runtime row intact to the next page instead of clipping it', async () => {
    const { paginateDynamicTable, createDynamicTable } = await import('./tableModel.ts');
    let table = createDynamicTable(3, 'items', 1, undefined, [
      { label: 'Product Description', field: 'description' },
      { label: 'SKU', field: 'sku' },
      { label: 'Qty', field: 'qty' },
    ]);
    // Make description dominant so the last record wraps to multiple lines.
    table.columns = table.columns.map((column, index) => ({ ...column, width: index === 0 ? 220 : 70, manualWidth: true }));
    const rows = [
      ...Array.from({ length: 7 }, (_, index) => ({ key: `short-${index}`, value: { description: `Short item ${index}`, sku: 'X', qty: 1 } as never })),
      { key: 'wrapped-last', value: { description: 'FML TRAVELLER NEW T00 686 324 2511 - AUXILIARY-AL AMI EXTRA LONG DESCRIPTION THAT WRAPS', sku: '1531231', qty: 2 } as never },
    ];
    const pages = paginateDynamicTable(table, rows, 170, 170, 420);
    const wrappedPage = pages.find((page) => page.runtimeRows.some((row) => row.key === 'wrapped-last'));
    expect(wrappedPage).toBeDefined();
    expect(wrappedPage!.usedHeightPx).toBeLessThanOrEqual(wrappedPage!.availableHeightPx);
    expect(pages.flatMap((page) => page.runtimeRows).map((row) => row.key)).toEqual(rows.map((row) => row.key));
  });

  it('materializes deterministic row ranges and page identities', async () => {
    const { paginateDynamicTable } = await import('./tableModel.ts');
    const table = createDynamicTable(3, 'items', 1);
    const rows = Array.from({ length: 16 }, (_, index) => ({ key: `LI-${index + 1}`, value: { line: index + 1 } as never }));
    const a = paginateDynamicTable(table, rows, 180, 220);
    const b = paginateDynamicTable(table, rows, 180, 220);
    expect(a.map((page) => page.id)).toEqual(b.map((page) => page.id));
    expect(a[0].startRow).toBe(0);
    for (let i = 1; i < a.length; i += 1) {
      if (a[i].runtimeRows.length) expect(a[i].startRow).toBe(a[i - 1].endRow + 1);
    }
  });

  it('keeps summary together without discarding usable row space on previous pages', async () => {
    const { paginateDynamicTable, addCustomSummaryRow } = await import('./tableModel.ts');
    const table = addCustomSummaryRow(createDynamicTable(4, 'items', 1));
    table.pagination.keepSummaryTogether = true;
    const rows = Array.from({ length: 14 }, (_, index) => ({ key: `row-${index}`, value: { id: index } as never }));
    const pages = paginateDynamicTable(table, rows, 220, 220);
    expect(pages[pages.length - 1]?.includeSummary).toBe(true);
    expect(pages.slice(0, -1).every((page) => page.includeSummary === false)).toBe(true);
    expect(pages.flatMap((page) => page.runtimeRows)).toHaveLength(rows.length);
  });
});


describe('DB-4G grouped summary table', () => {
  it('groups the active document by HSN and sums configured numeric fields', () => {
    const source = {
      id: 'invoice-data', name: 'Invoice Data', sourceType: 'csv', warnings: [], importedAt: '2026-09-12T00:00:00Z',
      fields: [],
      records: [
        { InvoiceNo: 'INV-001', HSN: '73181500', Taxable: 10000, CGST: 900, SGST: 900, IGST: 0, TotalGST: 1800, Total: 11800 },
        { InvoiceNo: 'INV-001', HSN: '73181500', Taxable: 5000, CGST: 450, SGST: 450, IGST: 0, TotalGST: 900, Total: 5900 },
        { InvoiceNo: 'INV-001', HSN: '73201020', Taxable: 8000, CGST: 720, SGST: 720, IGST: 0, TotalGST: 1440, Total: 9440 },
        { InvoiceNo: 'INV-002', HSN: '73181500', Taxable: 999999, CGST: 1, SGST: 1, IGST: 1, TotalGST: 3, Total: 1000002 },
      ],
    } as never;
    const table = createGroupedSummaryTable('Invoice Data', ['HSN'], [
      { label: 'HSN', field: 'HSN', operation: 'group', dataType: 'text' },
      { label: 'Taxable', field: 'Taxable', operation: 'sum', dataType: 'currency' },
      { label: 'CGST', field: 'CGST', operation: 'sum', dataType: 'currency' },
      { label: 'SGST', field: 'SGST', operation: 'sum', dataType: 'currency' },
      { label: 'IGST', field: 'IGST', operation: 'sum', dataType: 'currency' },
      { label: 'Total GST', field: 'TotalGST', operation: 'sum', dataType: 'currency' },
      { label: 'Total', field: 'Total', operation: 'sum', dataType: 'currency' },
    ], { sourceId: 'invoice-data', parentKey: 'InvoiceNo', parentKeys: ['InvoiceNo'] });

    const runtime = dynamicRows(table, { InvoiceNo: 'INV-001' } as never, source);
    expect(runtime).toHaveLength(2);
    const first = runtime[0].value as Record<string, unknown>;
    const second = runtime[1].value as Record<string, unknown>;
    expect(first.__grouped_0).toBe('73181500');
    expect(first.__grouped_1).toBe(15000);
    expect(first.__grouped_2).toBe(1350);
    expect(first.__grouped_3).toBe(1350);
    expect(first.__grouped_4).toBe(0);
    expect(first.__grouped_5).toBe(2700);
    expect(first.__grouped_6).toBe(17700);
    expect(second.__grouped_0).toBe('73201020');
    expect(second.__grouped_1).toBe(8000);
  });

  it('supports composite group keys plus count/avg/min/max/first/last', () => {
    const source = {
      id: 's', name: 'S', sourceType: 'json', warnings: [], importedAt: '', fields: [],
      records: [
        { Doc: 'D1', HSN: 'A', Rate: 18, Value: 10, Label: 'first' },
        { Doc: 'D1', HSN: 'A', Rate: 18, Value: 30, Label: 'last' },
        { Doc: 'D1', HSN: 'A', Rate: 5, Value: 100, Label: 'other' },
      ],
    } as never;
    const table = createGroupedSummaryTable('S', ['HSN', 'Rate'], [
      { label: 'HSN', field: 'HSN', operation: 'group' },
      { label: 'Rate', field: 'Rate', operation: 'group' },
      { label: 'Count', field: 'Value', operation: 'count' },
      { label: 'Avg', field: 'Value', operation: 'avg' },
      { label: 'Min', field: 'Value', operation: 'min' },
      { label: 'Max', field: 'Value', operation: 'max' },
      { label: 'First', field: 'Label', operation: 'first' },
      { label: 'Last', field: 'Label', operation: 'last' },
    ], { sourceId: 's', parentKey: 'Doc', parentKeys: ['Doc'] });
    const runtime = dynamicRows(table, { Doc: 'D1' } as never, source);
    expect(runtime).toHaveLength(2);
    const group18 = runtime.find((row) => (row.value as Record<string, unknown>).__grouped_1 === 18)!.value as Record<string, unknown>;
    expect(group18.__grouped_2).toBe(2);
    expect(group18.__grouped_3).toBe(20);
    expect(group18.__grouped_4).toBe(10);
    expect(group18.__grouped_5).toBe(30);
    expect(group18.__grouped_6).toBe('first');
    expect(group18.__grouped_7).toBe('last');
  });

  it('evaluates chained Grouped Summary formula columns after aggregates and leaves circular formulas blank', () => {
    const source = {
      id: 'gst', name: 'GST', sourceType: 'csv', warnings: [], importedAt: '', fields: [],
      records: [
        { Doc: 'D1', HSN: 'A', Taxable: 100, CGST: 9, SGST: 9, IGST: 0 },
        { Doc: 'D1', HSN: 'A', Taxable: 50, CGST: 4.5, SGST: 4.5, IGST: 0 },
      ],
    } as never;
    const table = createGroupedSummaryTable('GST', ['HSN'], [
      { label: 'HSN', field: 'HSN', operation: 'group' },
      { label: 'Taxable', field: 'Taxable', operation: 'sum' },
      { label: 'CGST', field: 'CGST', operation: 'sum' },
      { label: 'SGST', field: 'SGST', operation: 'sum' },
      { label: 'IGST', field: 'IGST', operation: 'sum' },
      { label: 'Total GST', field: '', operation: 'formula', formula: '[CGST] + [SGST] + [IGST]' },
      { label: 'Total', field: '', operation: 'formula', formula: '[Taxable] + [Total GST]' },
      { label: 'Loop', field: '', operation: 'formula', formula: '[Loop] + 1' },
    ], { sourceId: 'gst', parentKey: 'Doc', parentKeys: ['Doc'] });
    const runtime = dynamicRows(table, { Doc: 'D1' } as never, source);
    const row = runtime[0].value as Record<string, unknown>;
    expect(row.__grouped_1).toBe(150);
    expect(row.__grouped_2).toBe(13.5);
    expect(row.__grouped_3).toBe(13.5);
    expect(row.__grouped_5).toBe(27);
    expect(row.__grouped_6).toBe(177);
    expect(row.__grouped_7).toBeNull();
  });

  it('calculates one final total row from grouped output rows, including grouped Formula columns', () => {
    const source = {
      id: 'gst2', name: 'GST2', sourceType: 'csv', warnings: [], importedAt: '', fields: [],
      records: [
        { Doc: 'D1', HSN: 'A', Taxable: 100, CGST: 9, SGST: 9, IGST: 0 },
        { Doc: 'D1', HSN: 'A', Taxable: 50, CGST: 4.5, SGST: 4.5, IGST: 0 },
        { Doc: 'D1', HSN: 'B', Taxable: 200, CGST: 18, SGST: 18, IGST: 0 },
      ],
    } as never;
    let table = createGroupedSummaryTable('GST2', ['HSN'], [
      { label: 'HSN', field: 'HSN', operation: 'group' },
      { label: 'Taxable', field: 'Taxable', operation: 'sum' },
      { label: 'CGST', field: 'CGST', operation: 'sum' },
      { label: 'SGST', field: 'SGST', operation: 'sum' },
      { label: 'IGST', field: 'IGST', operation: 'sum' },
      { label: 'Total GST', field: '', operation: 'formula', formula: '[CGST] + [SGST] + [IGST]' },
      { label: 'Total', field: '', operation: 'formula', formula: '[Taxable] + [Total GST]' },
    ], { sourceId: 'gst2', parentKey: 'Doc', parentKeys: ['Doc'] });
    table = applyGroupedFinalSummary(table, {
      enabled: true,
      columns: [
        { operation: 'label', text: 'TOTAL' },
        { operation: 'sum' }, { operation: 'sum' }, { operation: 'sum' }, { operation: 'sum' },
        { operation: 'sum' },
        { operation: 'formula', formula: '[Taxable] + [Total GST]' },
      ],
    });
    const runtime = dynamicRows(table, { Doc: 'D1' } as never, source);
    const summary = evaluateTableSummaryRows(table, runtime.map((row) => row.value));
    const row = table.customRows[0];
    expect(row.cells[0].content).toBe('TOTAL');
    expect(summary.byCellId[row.cells[1].id]).toBe(350);
    expect(summary.byCellId[row.cells[5].id]).toBe(63);
    expect(summary.byCellId[row.cells[6].id]).toBe(413);
  });

  it('reconfigures a Grouped Summary while preserving visual table identity and widths', () => {
    const original = createGroupedSummaryTable('S', ['HSN'], [
      { label: 'HSN', field: 'HSN', operation: 'group' },
      { label: 'Taxable', field: 'Taxable', operation: 'sum' },
    ], { sourceId: 's', parentKey: 'Doc', parentKeys: ['Doc'] });
    original.columns[0].width = 222;
    original.columns[0].manualWidth = true;
    const updated = reconfigureGroupedSummaryTable(original, 'S', ['HSN'], [
      { label: 'HSN', field: 'HSN', operation: 'group' },
      { label: 'Taxable', field: 'Taxable', operation: 'sum' },
      { label: 'Total GST', field: '', operation: 'formula', formula: '[Taxable] * 0.18' },
    ], { sourceId: 's', parentKey: 'Doc', parentKeys: ['Doc'] });
    expect(updated.id).toBe(original.id);
    expect(updated.columns[0].id).toBe(original.columns[0].id);
    expect(updated.columns[0].width).toBe(222);
    expect(updated.columns[0].manualWidth).toBe(true);
    expect(updated.binding?.grouping?.columns[2].operation).toBe('formula');
  });

  it('preserves logical Grouped Summary column widths and styles when edit reorders columns', () => {
    const original = createGroupedSummaryTable('S', ['HSN'], [
      { label: 'HSN', field: 'HSN', operation: 'group' },
      { label: 'Taxable', field: 'Taxable', operation: 'sum' },
      { label: 'Total GST', field: '', operation: 'formula', formula: '[Taxable] * 0.18' },
    ], { sourceId: 's', parentKey: 'Doc', parentKeys: ['Doc'] });
    original.columns[0].width = 111;
    original.columns[1].width = 222;
    original.columns[2].width = 333;
    original.columns.forEach((column) => { column.manualWidth = true; });
    original.headerRows[0].cells[0].style.background = '#111111';
    original.headerRows[0].cells[1].style.background = '#222222';
    original.headerRows[0].cells[2].style.background = '#333333';

    const updated = reconfigureGroupedSummaryTable(original, 'S', ['HSN'], [
      { label: 'Total GST', field: '', operation: 'formula', formula: '[Taxable] * 0.18' },
      { label: 'HSN', field: 'HSN', operation: 'group' },
      { label: 'Taxable', field: 'Taxable', operation: 'sum' },
    ], { sourceId: 's', parentKey: 'Doc', parentKeys: ['Doc'] });

    expect(updated.binding?.grouping?.columns.map((column) => column.label)).toEqual(['Total GST', 'HSN', 'Taxable']);
    expect(updated.columns.map((column) => column.width)).toEqual([333, 111, 222]);
    expect(updated.columns.every((column) => column.manualWidth)).toBe(true);
    expect(updated.headerRows[0].cells.map((cell) => cell.style.background)).toEqual(['#333333', '#111111', '#222222']);
  });

});

describe('DB-6B Fix8 DISCOUNT formula parity', () => {
  it('calculates net amount from fraction discount', () => {
    expect(evaluateTableFormula('DISCOUNT([Basic Value], [Total Discount])', { 'Basic Value': 1980, 'Total Discount': 0.2 })).toBe(1584);
  });
  it('calculates net amount from whole-percent discount', () => {
    expect(evaluateTableFormula('DISCOUNT([Basic Value], [Total Discount])', { 'Basic Value': 1980, 'Total Discount': 20 })).toBe(1584);
  });
});


describe('normalizeTableFormulaReferences', () => {
  it('brackets bare calculated-column references while preserving DISCOUNT function calls', () => {
    const table = createDynamicTable(3, 'items', 1, undefined, [
      { label: 'Basic Value', field: 'Basic Value' },
      { label: 'Discount', field: 'Discount' },
      { label: 'Taxable', field: 'Taxable Value' },
    ]);
    table.bodyRows[0]!.cells[1] = { ...table.bodyRows[0]!.cells[1]!, valueMode: 'formula', binding: undefined, formula: '[Basic Value] * [Total Discount]' };
    table.bodyRows[0]!.cells[2] = { ...table.bodyRows[0]!.cells[2]!, valueMode: 'formula', binding: undefined, formula: '[Basic Value] - Discount' };
    const normalized = normalizeTableFormulaReferences(table);
    expect(normalized.bodyRows[0]!.cells[2]!.formula).toBe('[Basic Value] - [Discount]');
    normalized.bodyRows[0]!.cells[2]!.formula = 'DISCOUNT([Basic Value], [Total Discount])';
    expect(normalizeTableFormulaReferences(normalized).bodyRows[0]!.cells[2]!.formula).toBe('DISCOUNT([Basic Value], [Total Discount])');
  });
});


describe('UX-8.4 table conditional rendering', () => {
  it('filters dynamic rows before pagination input', () => {
    const table=createDynamicTable(2,'items',1);
    table.rowConditionalRendering={
      enabled:true,action:'show',match:'all',
      rules:[{id:'r1',field:'Qty',operator:'greaterThan',value:'0'}],
    };
    const rows=dynamicRows(table,{items:[
      {id:'1',Qty:2,Name:'A'},
      {id:'2',Qty:0,Name:'B'},
      {id:'3',Qty:5,Name:'C'},
    ]} as never);
    expect(rows.map((row)=>row.value.Name)).toEqual(['A','C']);
  });

  it('supports document, any-row and all-row whole-column visibility', () => {
    const table=createDynamicTable(3,'items',1);
    table.columns[0]!.conditionalRendering={enabled:true,action:'show',match:'all',rules:[{id:'a',field:'Status',operator:'equals',value:'Approved'}]};
    table.columns[0]!.conditionScope='document';
    table.columns[1]!.conditionalRendering={enabled:true,action:'show',match:'all',rules:[{id:'b',field:'Discount',operator:'greaterThan',value:'0'}]};
    table.columns[1]!.conditionScope='anyRow';
    table.columns[2]!.conditionalRendering={enabled:true,action:'show',match:'all',rules:[{id:'c',field:'Qty',operator:'greaterThan',value:'0'}]};
    table.columns[2]!.conditionScope='allRows';
    const runtime=[
      {key:'1',value:{Discount:0,Qty:1}},
      {key:'2',value:{Discount:5,Qty:2}},
    ] as never;
    expect(visibleTableColumnIndexes(table,{Status:'Approved'} as never,runtime)).toEqual([0,1,2]);
    expect(visibleTableColumnIndexes(table,{Status:'Draft'} as never,runtime)).toEqual([1,2]);
  });

  it('projects hidden columns out of header/body/summary grids without dead space', () => {
    const table=createDynamicTable(3,'items',1);
    table.headerRows[0]!.cells[0]!.colSpan=2;
    table.headerRows[0]!.cells.splice(1,1);
    const projected=projectTableVisibleColumns(table,[0,2]);
    expect(projected.columns).toHaveLength(2);
    expect(projected.headerRows[0]!.cells[0]!.colSpan).toBe(1);
    expect(projected.bodyRows[0]!.cells).toHaveLength(2);
  });


  it('preserves a structural spacer width when a neighboring conditional column hides', () => {
    const table=createCustomTable(4,1);
    table.columns.forEach((column,index)=>{ column.manualWidth=true; column.width=[200,50,100,150][index]!; });
    table.rows[0]!.cells[0]!.content='Amount in words';
    table.rows[0]!.cells[1]!.content=''; // intentional gap column
    table.rows[0]!.cells[2]!.content='Optional tax';
    table.rows[0]!.cells[3]!.content='Net payable';
    const full=stableConditionalColumnWidths(table,[0,1,2,3]);
    const hidden=stableConditionalColumnWidths(table,[0,1,3]);
    expect(full[1]).toBeCloseTo(10,6);
    expect(hidden[1]).toBeCloseTo(10,6);
    expect(hidden.reduce((sum,value)=>sum+value,0)).toBeCloseTo(100,6);
    expect(hidden[2]).toBeGreaterThan(full[3]!);
  });});


describe('UX-8.4 Fix2 conditional table auto reflow', () => {
  it('redistributes hidden content width proportionally while keeping spacer width fixed', () => {
    const table=createCustomTable(4,1);
    table.columns.forEach((column,index)=>{ column.manualWidth=true; column.width=[400,100,200,300][index]!; });
    table.rows[0]!.cells[0]!.content='Description';
    table.rows[0]!.cells[1]!.content=''; // spacer
    table.rows[0]!.cells[2]!.content='Optional Tax';
    table.rows[0]!.cells[3]!.content='Net';
    const widths=stableConditionalColumnWidths(table,[0,1,3]);
    expect(widths[1]).toBeCloseTo(10,6);
    expect(widths[0]).toBeCloseTo(51.428571,5);
    expect(widths[2]).toBeCloseTo(38.571429,5);
    expect(widths.reduce((sum,value)=>sum+value,0)).toBeCloseTo(100,6);
  });

  it('projects conditional columns before pagination so height shrinks with wider remaining columns', () => {
    const table=createDynamicTable(3,'items',1);
    table.columns.forEach((column,index)=>{ column.manualWidth=true; column.width=[200,200,200][index]!; });
    table.bodyRows[0]!.autoHeight=true;
    table.bodyRows[0]!.cells[0]!.binding='Description';
    table.bodyRows[0]!.cells[1]!.binding='Optional';
    table.bodyRows[0]!.cells[2]!.binding='Amount';
    const runtime=[
      {key:'1',value:{Description:'A long product description that wraps across several lines in a narrow column',Optional:'x',Amount:100}},
      {key:'2',value:{Description:'A long product description that wraps across several lines in a narrow column',Optional:'x',Amount:200}},
    ] as never;
    const fullLayout=projectConditionalRuntimeTable(table,[0,1,2],runtime.map((row:any)=>row.value));
    const hiddenLayout=projectConditionalRuntimeTable(table,[0,2],runtime.map((row:any)=>row.value));
    const full=paginateDynamicTable(fullLayout.table,runtime,1000,1000,600,fullLayout.columnWidths);
    const hidden=paginateDynamicTable(hiddenLayout.table,runtime,1000,1000,600,hiddenLayout.columnWidths);
    expect(hidden[0]!.usedHeightPx).toBeLessThan(full[0]!.usedHeightPx);
  });

  it('row conditions reduce the runtime table height before pagination', () => {
    const table=createDynamicTable(2,'items',1);
    table.rowConditionalRendering={enabled:true,action:'show',match:'all',rules:[{id:'qty',field:'Qty',operator:'greaterThan',value:'0'}]};
    const record={items:[
      {Id:'1',Name:'A',Qty:1},
      {Id:'2',Name:'B',Qty:0},
      {Id:'3',Name:'C',Qty:0},
      {Id:'4',Name:'D',Qty:2},
    ]} as never;
    const rows=dynamicRows(table,record);
    const layout=projectConditionalRuntimeTable(table,[0,1],rows.map((row)=>row.value));
    const pages=paginateDynamicTable(layout.table,rows,1000,1000,600,layout.columnWidths);
    expect(rows).toHaveLength(2);
    expect(pages[0]!.usedHeightPx).toBeLessThan(200);
  });
});
