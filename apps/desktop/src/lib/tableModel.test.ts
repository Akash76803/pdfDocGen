import { describe, expect, it } from 'vitest';
import { addCustomSummaryRow, createCustomTable, createDynamicTable, dynamicRows, recommendedRowKey, updateTableCell } from './tableModel.ts';

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
    expect(table.customRows[0].cells[0].content).toBe('Total');
    expect(table.customRows[0].cells[0].colSpan).toBe(4);
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
  const { addTableRow, deleteTableRow } = require('./tableModel.ts') as typeof import('./tableModel.ts');
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
  const { addTableColumn } = require('./tableModel.ts') as typeof import('./tableModel.ts');
  const table = createDynamicTable(3, 'Invoice Export', 1);
  const bodyRowId = table.bodyRows[0].id;
  const added = addTableColumn(table, table.bodyRows[0].cells[1].id, 'right');
  expect(added.columns).toHaveLength(4);
  expect(added.bodyRows).toHaveLength(1);
  expect(added.bodyRows[0].id).toBe(bodyRowId);
  expect(added.bodyRows[0].cells).toHaveLength(4);
});

it('DB-4.2 expands and contracts colSpan when columns are inserted/deleted inside a merged cell', () => {
  const { addTableColumn, deleteTableColumn } = require('./tableModel.ts') as typeof import('./tableModel.ts');
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
  const { moveTableColumn } = require('./tableModel.ts') as typeof import('./tableModel.ts');
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
