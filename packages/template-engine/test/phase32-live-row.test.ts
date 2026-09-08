import { describe, expect, it } from 'vitest';
import type { DocumentGroup, TemplateDefinition } from '@document-tool/contracts';
import { TemplateEngine } from '../src/template-engine.js';
import { TemplateValidator } from '../src/template-validator.js';

const group1: DocumentGroup = {
  id: 'g1', key: 'INV001',
  header: { invoice: { number: 'INV001', date: '2026-08-20' }, customer: { name: 'ABC Ltd' } },
  items: [{ product: 'A', qty: 2, rate: 100 }, { product: 'B', qty: 1, rate: 50 }],
  itemDetails: [], sourceRowIndexes: [2,3], warnings: [], valid: true,
};
const group2: DocumentGroup = {
  id: 'g2', key: 'INV002',
  header: { invoice: { number: 'INV002', date: '2026-08-21' }, customer: { name: 'XYZ Ltd' } },
  items: [{ product: 'C', qty: 5, rate: 25 }],
  itemDetails: [], sourceRowIndexes: [4], warnings: [], valid: true,
};
const base = (): TemplateDefinition => ({
  id: 'phase32', name: 'Phase 3.2', version: 1,
  page: { size: 'A4', orientation: 'PORTRAIT', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
  header: { blocks: [] }, body: { blocks: [] }, footer: { blocks: [] },
});

describe('Phase 3.2 live data rendering', () => {
  it('resolves nested live field values', () => {
    const t = base();
    t.body.blocks = [{ id: 'f', type: 'FIELD', label: 'Invoice No', path: 'invoice.number' }];
    const block = new TemplateEngine().buildRenderModel(t, group1).model?.body?.[0];
    expect(block).toMatchObject({ type: 'FIELD', value: 'INV001' });
  });

  it('resolves live table rows', () => {
    const t = base();
    t.body.blocks = [{ id: 'tb', type: 'TABLE', sourcePath: 'items', columns: [{ id: 'p', label: 'Product', path: 'product' }, { id: 'q', label: 'Qty', path: 'qty' }] }];
    const block = new TemplateEngine().buildRenderModel(t, group1).model?.body?.[0];
    if (block?.type !== 'TABLE') throw new Error('Expected table');
    expect(block.rows).toEqual([['A', 2], ['B', 1]]);
  });

  it('changes rendered values when the selected group changes without changing template', () => {
    const t = base();
    t.body.blocks = [{ id: 'f', type: 'FIELD', label: 'Customer', path: 'customer.name' }];
    const engine = new TemplateEngine();
    const before = JSON.stringify(t);
    expect(engine.buildRenderModel(t, group1).model?.body?.[0]).toMatchObject({ type: 'FIELD', value: 'ABC Ltd' });
    expect(engine.buildRenderModel(t, group2).model?.body?.[0]).toMatchObject({ type: 'FIELD', value: 'XYZ Ltd' });
    expect(JSON.stringify(t)).toBe(before);
  });

  it('handles invalid field path safely with fallback and warning', () => {
    const t = base();
    t.body.blocks = [{ id: 'f', type: 'FIELD', label: 'Missing', path: 'customer.unknown', fallback: '—' }];
    const result = new TemplateEngine().buildRenderModel(t, group1);
    expect(result.model?.body?.[0]).toMatchObject({ type: 'FIELD', value: '—' });
    expect(result.warnings.some((warning) => warning.code === 'FIELD_VALUE_MISSING')).toBe(true);
  });

  it('handles invalid table source safely as empty', () => {
    const t = base();
    t.body.blocks = [{ id: 'tb', type: 'TABLE', sourcePath: 'missingRows', columns: [{ id: 'p', label: 'P', path: 'product' }] }];
    const result = new TemplateEngine().buildRenderModel(t, group1);
    expect(result.model?.body?.[0]).toMatchObject({ type: 'TABLE', rows: [], empty: true });
    expect(result.warnings.some((warning) => warning.code === 'TABLE_SOURCE_NOT_ARRAY')).toBe(true);
  });
});

describe('Phase 3.2 independent field value style', () => {
  it('preserves label and value styles including independent alignments', () => {
    const t = base();
    t.body.blocks = [{
      id: 'f', type: 'FIELD', label: 'Invoice', path: 'invoice.number', layoutMode: 'INLINE', textAlignment: 'LEFT',
      labelStyle: { fontFamily: 'Arial', fontSize: 10, bold: true, italic: false, textColor: '#666666', alignment: 'LEFT' },
      valueStyle: { fontFamily: 'Georgia', fontSize: 16, bold: true, italic: true, textColor: '#2563EB', alignment: 'RIGHT' },
    }];
    const block = new TemplateEngine().buildRenderModel(t, group1).model?.body?.[0];
    expect(block).toMatchObject({
      type: 'FIELD', layoutMode: 'INLINE',
      labelStyle: { fontFamily: 'Arial', fontSize: 10, bold: true, alignment: 'LEFT' },
      valueStyle: { fontFamily: 'Georgia', fontSize: 16, bold: true, italic: true, textColor: '#2563EB', alignment: 'RIGHT' },
    });
  });

  it('preserves stacked mode and spacing', () => {
    const t = base();
    t.body.blocks = [{ id: 'f', type: 'FIELD', label: 'Invoice', path: 'invoice.number', layoutMode: 'STACKED', spacing: 4 }];
    expect(new TemplateEngine().buildRenderModel(t, group1).model?.body?.[0]).toMatchObject({ type: 'FIELD', layoutMode: 'STACKED', spacing: 4 });
  });
});

describe('Phase 3.2 row contract and validation', () => {
  it('renders image + text row with resolved structural values', () => {
    const t = base();
    t.header.blocks = [{
      id: 'row', type: 'ROW', gap: 5, verticalAlignment: 'CENTER', layout: { widthPercent: 100, alignment: 'LEFT' }, children: [
        { id: 'logo', type: 'IMAGE', sourceType: 'DATA_URL', source: 'data:image/png;base64,iVBORw0KGgo=', width: 30, layout: { widthPercent: 30 }, maintainAspectRatio: true },
        { id: 'title', type: 'TEXT', text: 'TAX INVOICE', layout: { widthPercent: 70 }, style: { alignment: 'CENTER', bold: true } },
      ],
    }];
    const block = new TemplateEngine().buildRenderModel(t, group1).model?.header?.[0];
    expect(block).toMatchObject({ type: 'ROW', gap: 5, verticalAlignment: 'CENTER', layout: { widthPercent: 100 }, children: [{ type: 'IMAGE', layout: { widthPercent: 30 } }, { type: 'TEXT', layout: { widthPercent: 70 } }] });
  });

  it('resolves live FIELD inside ROW', () => {
    const t = base();
    t.body.blocks = [{ id: 'row', type: 'ROW', gap: 2, children: [{ id: 'f', type: 'FIELD', label: 'Invoice', path: 'invoice.number', layout: { widthPercent: 50 } }] }];
    const block = new TemplateEngine().buildRenderModel(t, group2).model?.body?.[0];
    if (block?.type !== 'ROW') throw new Error('Expected row');
    expect(block.children[0]).toMatchObject({ type: 'FIELD', value: 'INV002', layout: { widthPercent: 50 } });
  });

  it('accepts row child widths totaling 100', () => {
    const t = base();
    t.body.blocks = [{ id: 'row', type: 'ROW', children: [
      { id: 'a', type: 'TEXT', text: 'A', layout: { widthPercent: 30 } },
      { id: 'b', type: 'TEXT', text: 'B', layout: { widthPercent: 70 } },
    ] }];
    expect(new TemplateValidator().validate(t).valid).toBe(true);
  });

  it('rejects row child widths above 100 total', () => {
    const t = base();
    t.body.blocks = [{ id: 'row', type: 'ROW', children: [
      { id: 'a', type: 'TEXT', text: 'A', layout: { widthPercent: 60 } },
      { id: 'b', type: 'TEXT', text: 'B', layout: { widthPercent: 50 } },
    ] }];
    expect(new TemplateValidator().validate(t).errors.some((error) => error.code === 'ROW_CHILD_WIDTH_TOTAL_INVALID')).toBe(true);
  });

  it('rejects invalid row width and negative gap', () => {
    const t = base();
    t.body.blocks = [{ id: 'row', type: 'ROW', gap: -1, layout: { widthPercent: 101 }, children: [{ id: 'a', type: 'TEXT', text: 'A', layout: { widthPercent: 100 } }] }];
    const codes = new TemplateValidator().validate(t).errors.map((error) => error.code);
    expect(codes).toContain('BLOCK_WIDTH_INVALID');
    expect(codes).toContain('ROW_GAP_INVALID');
  });

  it('rejects empty rows', () => {
    const t = base();
    t.body.blocks = [{ id: 'row', type: 'ROW', children: [] }];
    expect(new TemplateValidator().validate(t).errors.some((error) => error.code === 'ROW_CHILD_REQUIRED')).toBe(true);
  });

  it('rejects invalid vertical alignment at runtime validator boundary', () => {
    const t = base();
    t.body.blocks = [{ id: 'row', type: 'ROW', verticalAlignment: 'MIDDLE' as never, children: [{ id: 'a', type: 'TEXT', text: 'A' }] }];
    expect(new TemplateValidator().validate(t).errors.some((error) => error.code === 'ROW_VERTICAL_ALIGNMENT_INVALID')).toBe(true);
  });

  it('keeps Phase 3.1 templates without rows backward compatible', () => {
    const t = base();
    t.body.blocks = [{ id: 'f', type: 'FIELD', label: 'Customer', path: 'customer.name' }, { id: 'tb', type: 'TABLE', sourcePath: 'items', columns: [{ id: 'p', label: 'Product', path: 'product' }] }];
    const engine = new TemplateEngine();
    expect(engine.validate(t).valid).toBe(true);
    expect(engine.buildRenderModel(t, group1).errors).toHaveLength(0);
  });
});

describe('Phase 3.4 Fix 3 imported-header table binding', () => {
  it('falls back to the original imported source header when mapped item path is unavailable', () => {
    const t = base();
    t.body.blocks = [{
      id: 'tb', type: 'TABLE', sourcePath: 'items', columns: [
        { id: 'customer', label: 'Customer Name', path: 'fields.customerName', sourceField: 'CustomerName', targetPath: 'fields.customerName' },
        { id: 'qty', label: 'Qty', path: 'items.qty', sourceField: 'Qty', targetPath: 'items.qty' },
      ],
    }];
    const group: DocumentGroup = {
      id: 'g-source', key: 'INV-SOURCE', header: { invoice: { number: 'INV-SOURCE' } },
      items: [{ items: { qty: 2 } }, { items: { qty: 3 } }],
      sourceItems: [{ CustomerName: 'ABC Ltd', Qty: 2 }, { CustomerName: 'ABC Ltd', Qty: 3 }],
      itemDetails: [], sourceRowIndexes: [2, 3], warnings: [], valid: true,
    };
    const block = new TemplateEngine().buildRenderModel(t, group).model?.body?.[0];
    if (block?.type !== 'TABLE') throw new Error('Expected table');
    expect(block.rows).toEqual([['ABC Ltd', 2], ['ABC Ltd', 3]]);
  });
});
