import { describe, expect, it } from 'vitest';
import { createDynamicTable, paginateDynamicTable, type TablePaginationRuntimeRow } from './tableModel.ts';
import { contentBoundsPx, defaultPageSettings } from './pageModel.ts';
import { materializeBodyFlowPages } from './bodyFlow.ts';

const widths = [23, 9, 9, 5.5, 14, 16.5, 9.5, 13.5]; // Tax template's 8-column proportions, rounded
function fixture() {
  const table = createDynamicTable(8, 'test-items');
  const fields = ['Description', 'HSN', 'Product Code', 'Quantity', 'Basic', 'Taxable', 'Unit Wt', 'Total'];
  for (const row of [...table.headerRows, ...table.bodyRows]) {
    row.autoHeight = true;
    row.cells.forEach((cell, index) => {
      cell.style.fontSize = 11;
      cell.style.padding = 5;
      if (row.kind === 'header') cell.content = fields[index]!;
      else { cell.binding = fields[index]!; cell.valueMode = 'binding'; }
    });
  }
  const rows: TablePaginationRuntimeRow[] = Array.from({ length: 59 }, (_, index) => ({
    key: String(index),
    value: {
      Description: 'PART ' + String(index).padStart(3, '0'),
      HSN: '73201020', 'Product Code': 'P' + String(index),
      Quantity: 2, Basic: 10, Taxable: 20, 'Unit Wt': 3, Total: 6,
    },
  }));
  return { table, rows };
}

describe('Tax-like pagination regression: compact rows and future footer', () => {
  it('uses the actual 1px collapsed table border for 11px/5px single-line rows, not an extra 1px each', () => {
    const { table, rows } = fixture();
    const pages = paginateDynamicTable(table, rows, 2000, 2000, 1009, widths);
    expect(pages).toHaveLength(1);
    // 13.75px line-height + 10px vertical padding + 1px collapsed border = ceil(24.75) = 25px.
    // With 59 records, a 1px overcount per row leaves ~59px fake blank space.
    expect(pages[0]!.usedHeightPx).toBe(25 + 59 * 25);
  });

  it('keeps all 59 records ordered and places the following HSN summary above a future footer', () => {
    const { table, rows } = fixture();
    const settings = defaultPageSettings();
    settings.preset = 'A3';
    settings.footer = { enabled: true, heightMm: 15, gapMm: 5, repeat: 'every' };
    const bounds = contentBoundsPx(settings);
    const flow = [
      { id: 'top', type: 'text', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'top', x: 0, y: 0, width: 1000, height: 340, flowGapAfterMm: 4 },
      { id: 'items', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'items', x: 0, y: 0, width: 1009, height: 1065, flowGapAfterMm: 4 },
      { id: 'hsn', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'hsn', x: 0, y: 0, width: 550, height: 85, flowGapAfterMm: 4 },
    ];
    const planned = materializeBodyFlowPages(flow, settings, (element, _pageIndex, _y, available, continuation) => {
      if (element.id !== 'items') return undefined;
      const parts = paginateDynamicTable(table, rows, available, continuation, 1009, widths);
      expect(parts.flatMap((part) => part.runtimeRows.map((row) => row.key))).toEqual(rows.map((row) => row.key));
      expect(parts.every((part) => part.usedHeightPx <= part.availableHeightPx)).toBe(true);
      return { pageCount: parts.length, lastPageUsedHeightPx: parts[parts.length - 1]!.usedHeightPx };
    });
    const items = planned.placements.get('items')!;
    const hsn = planned.placements.get('hsn')!;
    expect(items.endPageIndex).toBeGreaterThan(items.pageIndex);
    expect(hsn.pageIndex).toBeGreaterThanOrEqual(items.endPageIndex);
    if (hsn.pageIndex === items.endPageIndex) expect(hsn.y).toBeGreaterThanOrEqual(items.endY);
    expect(hsn.endY).toBeLessThanOrEqual(bounds.y + bounds.height);
  });
});
