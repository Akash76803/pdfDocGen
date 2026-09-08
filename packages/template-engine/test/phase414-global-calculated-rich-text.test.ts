import { describe, expect, it } from 'vitest';
import { TemplateEngine } from '../src/template-engine.js';
import type { DocumentGroup, TemplateDefinition } from '@document-tool/contracts';

const group: DocumentGroup = {
  id: 'invoice-1', key: 'invoice-1',
  header: { customer: { name: 'ABC Ltd' } },
  items: [
    { product: 'A', type: 'PRODUCT', finalAmount: 1000 },
    { product: 'Freight', type: 'FREIGHT', finalAmount: 47.2 },
  ],
  sourceItems: [],
} as any;

function template(): TemplateDefinition {
  return {
    id: 'phase414', name: 'Phase 4.14 Calculated Rich Text',
    page: { size: 'A4', orientation: 'PORTRAIT', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
    dataViews: [
      { id: 'freight-view', name: 'Freight Rows', alias: 'freightRows', sourcePath: 'items', filter: { path: 'type', operator: 'EQUALS', value: 'FREIGHT' } },
    ],
    calculatedFields: [
      { id: 'freight', name: 'Freight Amount', alias: 'freightAmount', value: { operation: 'SUM', sourcePath: 'views.freightRows', path: 'finalAmount' } },
      { id: 'grand', name: 'Grand Total', alias: 'grandTotal', value: { operation: 'FORMULA', sourcePath: 'items', expression: '{{freight}} + 10', formulaBindings: [
        { id: 'freight', label: 'Freight', path: 'calc.freightAmount' },
      ] } },
    ],
    header: { blocks: [{ id: 'header-text', type: 'TEXT', text: 'Header freight {{calc.freightAmount}}' }] },
    body: { blocks: [
      { id: 'normal', type: 'TEXT', text: 'Freight: {{calc.freightAmount}}', fieldTokens: { 'calc.freightAmount': { format: { type: 'CURRENCY', currencyCode: 'INR', currencySymbol: '₹', decimals: 2 } } } },
      { id: 'row', type: 'ROW', children: [], columns: [{ id: 'c', children: [{ id: 'row-text', type: 'TEXT', text: 'Row {{calc.freightAmount}}' }] }] },
      { id: 'box', type: 'BOX', children: [{ id: 'box-text', type: 'TEXT', text: 'Box {{calc.freightAmount}}' }] },
      { id: 'grid', type: 'CUSTOM_TABLE', rowCount: 1, columnCount: 1, cells: [{ id: 'grid-cell', row: 0, column: 0, content: { type: 'TEXT', text: 'Grid {{calc.freightAmount}}' } }] },
    ] },
    footer: { blocks: [{ id: 'footer-text', type: 'TEXT', text: 'Footer formula {{calc.grandTotal}}' }] },
  } as any;
}

describe('Phase 4.14 global Calculated Fields in Rich Text', () => {
  it('resolves the same calc.<alias> token in header, body, row, box, grid and footer', () => {
    const result = new TemplateEngine().buildRenderModel(template(), group);
    expect(result.errors).toEqual([]);
    const model = result.model! as any;
    expect(model.header[0].text).toBe('Header freight 47.2');
    expect(model.body[0].text).toBe('Freight: ₹47.20');
    expect(model.body[1].columns[0].children[0].text).toBe('Row 47.2');
    expect(model.body[2].children[0].text).toBe('Box 47.2');
    expect(model.body[3].cells[0].content.value).toBe('Grid 47.2');
    expect(model.footer[0].text).toBe('Footer formula 57.2');
  });

  it('keeps normal rich-text source fields backward compatible beside calculated fields', () => {
    const t = template();
    (t.body.blocks[0] as any).text = 'Customer {{customer.name}} / Freight {{calc.freightAmount}}';
    (t.body.blocks[0] as any).fieldTokens = undefined;
    const result = new TemplateEngine().buildRenderModel(t, group);
    expect(result.errors).toEqual([]);
    expect((result.model!.body[0] as any).text).toBe('Customer ABC Ltd / Freight 47.2');
  });
});
