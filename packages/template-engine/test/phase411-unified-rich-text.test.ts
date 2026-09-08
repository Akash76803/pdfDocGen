import { describe, expect, it } from 'vitest';
import { TemplateEngine } from '../src/template-engine.js';
import type { DocumentGroup, TemplateDefinition } from '@document-tool/contracts';

const group: DocumentGroup = {
  id: 'g1', key: 'g1',
  header: { customer: { name: 'ABC Ltd' }, tax: { rate: 0.18 } },
  items: [], sourceItems: []
} as any;

const base: TemplateDefinition = {
  id: 't-unified', name: 'Unified Rich Text',
  page: { size: 'A4', orientation: 'PORTRAIT', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
  header: { blocks: [] }, body: { blocks: [] }, footer: { blocks: [] }
} as any;

const richText = {
  text: 'Customer: {{customer.name}}\nGST: {{tax.rate}}',
  fieldTokens: { 'tax.rate': { format: { type: 'PERCENT', percentInputMode: 'FRACTION', decimals: 0 } } }
};

describe('Phase 4.11 Fix1 unified rich text everywhere', () => {
  it('resolves the same rich text contract in a normal TEXT block', () => {
    const template = { ...base, body: { blocks: [{ id: 'txt', type: 'TEXT', ...richText }] } } as any;
    const result = new TemplateEngine().buildRenderModel(template, group);
    expect(result.errors).toEqual([]);
    expect((result.model!.body[0] as any).text).toBe('Customer: ABC Ltd\nGST: 18%');
  });

  it('resolves the same rich text contract in a ROW cell child', () => {
    const template = { ...base, body: { blocks: [{ id: 'row', type: 'ROW', children: [], columns: [{ id: 'cell', children: [{ id: 'txt', type: 'TEXT', ...richText }] }] }] } } as any;
    const result = new TemplateEngine().buildRenderModel(template, group);
    const row = result.model!.body[0] as any;
    expect(row.columns[0].children[0].text).toBe('Customer: ABC Ltd\nGST: 18%');
  });

  it('resolves the same rich text contract in a BOX child', () => {
    const template = { ...base, body: { blocks: [{ id: 'box', type: 'BOX', children: [{ id: 'txt', type: 'TEXT', ...richText }] }] } } as any;
    const result = new TemplateEngine().buildRenderModel(template, group);
    const box = result.model!.body[0] as any;
    expect(box.children[0].text).toBe('Customer: ABC Ltd\nGST: 18%');
  });

  it('resolves the same rich text contract in Custom Grid TEXT content', () => {
    const template = { ...base, body: { blocks: [{
      id: 'grid', type: 'CUSTOM_TABLE', rowCount: 1, columnCount: 1,
      cells: [{ id: 'c1', row: 0, column: 0, content: { type: 'TEXT', ...richText } }]
    }] } } as any;
    const result = new TemplateEngine().buildRenderModel(template, group);
    expect(result.errors).toEqual([]);
    const grid = result.model!.body[0] as any;
    expect(grid.cells[0].content.value).toBe('Customer: ABC Ltd\nGST: 18%');
  });

  it('keeps legacy plain Custom Grid text backward compatible', () => {
    const template = { ...base, body: { blocks: [{
      id: 'grid', type: 'CUSTOM_TABLE', rowCount: 1, columnCount: 1,
      cells: [{ id: 'c1', row: 0, column: 0, content: { type: 'TEXT', text: 'Legacy plain text' } }]
    }] } } as any;
    const result = new TemplateEngine().buildRenderModel(template, group);
    expect((result.model!.body[0] as any).cells[0].content.value).toBe('Legacy plain text');
  });
});
