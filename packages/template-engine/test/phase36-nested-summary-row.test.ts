import { describe, expect, it } from 'vitest';
import type { DocumentGroup, TemplateDefinition } from '@document-tool/contracts';
import { TemplateEngine } from '../src/template-engine.js';

const group: DocumentGroup = {
  id: 'g1', key: 'INV-1', header: {},
  items: [{ finalAmount: 100, taxAmount: 18 }, { finalAmount: 200, taxAmount: 36 }],
  sourceItems: [{ 'Final Amount': 100, 'Tax Amount': 18 }, { 'Final Amount': 200, 'Tax Amount': 36 }],
  itemDetails: [], sourceRowIndexes: [0, 1], warnings: [], valid: true,
};

const summary = (id: string, label: string, path: string, sourceField: string, format: 'NUMBER'|'WORDS' = 'NUMBER') => ({
  id,
  type: 'SUMMARY_TABLE' as const,
  title: '', dataMode: 'MANUAL' as const, sourcePath: 'items', showHeader: false,
  layout: { widthPercent: 100, alignment: 'LEFT' as const },
  columns: [{ id: `${id}-l`, label: 'Label', widthPercent: 45, alignment: 'LEFT' as const }, { id: `${id}-v`, label: 'Value', widthPercent: 55, alignment: 'LEFT' as const }],
  rows: [{ id: `${id}-r`, cells: [
    { id: `${id}-label`, columnId: `${id}-l`, value: { operation: 'STATIC' as const, staticValue: label } },
    { id: `${id}-value`, columnId: `${id}-v`, value: { operation: 'SUM' as const, path, sourceField, targetPath: path, decimals: 2, format } },
  ] }],
});

const template: TemplateDefinition = {
  id: 'nested-summary', name: 'Nested summary', version: 1,
  page: { size: 'A4', orientation: 'PORTRAIT', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
  header: { blocks: [] }, footer: { blocks: [] },
  body: { blocks: [{
    id: 'totals-row', type: 'ROW', gap: 3, verticalAlignment: 'TOP', children: [], layout: { widthPercent: 100, alignment: 'LEFT' },
    columns: [
      { id: 'words-cell', widthPercent: 65, children: [summary('words', 'TOTAL AMOUNT TO PAY (IN WORDS)', 'items.finalAmount', 'Final Amount', 'WORDS')] },
      { id: 'amount-cell', widthPercent: 35, children: [summary('amount', 'TOTAL AMOUNT TO PAY', 'items.finalAmount', 'Final Amount', 'NUMBER')] },
    ],
  }] },
};

describe('Phase 3.6 nested summary row', () => {
  it('renders summary tables inside row cells using live calculations', () => {
    const result = new TemplateEngine().buildRenderModel(template, group);
    expect(result.errors).toEqual([]);
    const row = result.model!.body![0];
    expect(row.type).toBe('ROW');
    if (row.type !== 'ROW') throw new Error('expected row');
    expect(row.columns[0]!.children[0]!.type).toBe('SUMMARY_TABLE');
    const words = row.columns[0]!.children[0];
    const amount = row.columns[1]!.children[0];
    if (words.type !== 'SUMMARY_TABLE' || amount.type !== 'SUMMARY_TABLE') throw new Error('expected summaries');
    expect(String(words.rows[0]!.cells[1]!.value)).toMatch(/Three Hundred/i);
    expect(amount.rows[0]!.cells[1]!.value).toBe('300.00');
  });
});
