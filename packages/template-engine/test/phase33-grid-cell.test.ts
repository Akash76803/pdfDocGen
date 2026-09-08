import { describe, expect, it } from 'vitest';
import type { DocumentGroup, TemplateDefinition } from '@document-tool/contracts';
import { TemplateEngine } from '../src/template-engine.js';

const group: DocumentGroup = {
  id: 'g1', key: 'INV-1', header: { invoice: { number: 'INV-1' }, customer: { name: 'ABC Ltd' } },
  items: [], itemDetails: [], sourceRowIndexes: [1], warnings: [], valid: true,
};

function template(): TemplateDefinition {
  return {
    id: 'grid', name: 'Grid', version: 1,
    page: { size: 'A4', orientation: 'PORTRAIT', margins: { top: 10, right: 10, bottom: 10, left: 10 }, backgroundColor: '#FFFFFF', border: { enabled: true, style: 'SOLID', width: 1, color: '#111827', offset: 4 } },
    header: { blocks: [] }, footer: { blocks: [] },
    body: { blocks: [{
      id: 'row', type: 'ROW', children: [], gap: 4, verticalAlignment: 'CENTER', layout: { widthPercent: 100 }, columns: [
        { id: 'c1', widthPercent: 30, style: { backgroundColor: '#F3F4F6', border: { style: 'SOLID', width: 1, color: '#CBD5E1' }, padding: { top: 2, right: 3, bottom: 2, left: 3 }, minHeight: 20, horizontalAlignment: 'LEFT', verticalAlignment: 'CENTER' }, children: [
          { id: 'txt', type: 'TEXT', text: 'Logo area', layout: { widthPercent: 100 } },
        ] },
        { id: 'c2', widthPercent: 70, style: { horizontalAlignment: 'RIGHT', verticalAlignment: 'TOP' }, children: [
          { id: 'field', type: 'FIELD', label: 'Invoice', path: 'invoice.number', fallback: '—', layout: { widthPercent: 100 } },
          { id: 'field2', type: 'FIELD', label: 'Customer', path: 'customer.name', fallback: '—', layout: { widthPercent: 100 } },
        ] },
      ],
    }] },
  };
}

describe('Phase 3.3 grid/cell layout', () => {
  it('preserves page border configuration', () => {
    const result = new TemplateEngine().buildRenderModel(template(), group);
    expect(result.model?.page?.border).toEqual({ enabled: true, style: 'SOLID', width: 1, color: '#111827', offset: 4 });
  });

  it('renders structured row columns and cell styles', () => {
    const result = new TemplateEngine().buildRenderModel(template(), group);
    const row = result.model?.body?.[0];
    expect(row?.type).toBe('ROW');
    if (row?.type !== 'ROW') throw new Error('Expected ROW');
    expect(row.columns).toHaveLength(2);
    expect(row.columns[0]?.widthPercent).toBe(30);
    expect(row.columns[0]?.style.minHeight).toBe(20);
    expect(row.columns[0]?.style.backgroundColor).toBe('#F3F4F6');
    expect(row.columns[0]?.style.padding.left).toBe(3);
    expect(row.columns[0]?.style.border.style).toBe('SOLID');
  });

  it('allows multiple content blocks inside one cell and resolves live fields', () => {
    const result = new TemplateEngine().buildRenderModel(template(), group);
    const row = result.model?.body?.[0];
    if (row?.type !== 'ROW') throw new Error('Expected ROW');
    expect(row.columns[1]?.children).toHaveLength(2);
    const first = row.columns[1]?.children[0];
    const second = row.columns[1]?.children[1];
    expect(first?.type).toBe('FIELD');
    expect(first?.type === 'FIELD' ? first.value : null).toBe('INV-1');
    expect(second?.type === 'FIELD' ? second.value : null).toBe('ABC Ltd');
  });

  it('rejects row column totals over 100%', () => {
    const bad = template();
    const row = bad.body.blocks[0];
    if (row.type !== 'ROW' || !row.columns) throw new Error('Expected grid row');
    row.columns[0]!.widthPercent = 60;
    row.columns[1]!.widthPercent = 60;
    const validation = new TemplateEngine().validate(bad);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((error) => error.code === 'ROW_COLUMN_WIDTH_TOTAL_INVALID')).toBe(true);
  });

  it('rejects invalid page border values', () => {
    const bad = template();
    bad.page.border = { enabled: true, style: 'SOLID', width: -1, color: '#GGGGGG', offset: -2 };
    const validation = new TemplateEngine().validate(bad);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((error) => error.code === 'PAGE_BORDER_INVALID')).toBe(true);
    expect(validation.errors.some((error) => error.code === 'STYLE_COLOR_INVALID')).toBe(true);
  });

  it('keeps legacy Phase 3.2 ROW children compatible', () => {
    const legacy = template();
    legacy.body.blocks = [{ id: 'legacy-row', type: 'ROW', children: [{ id: 'legacy-text', type: 'TEXT', text: 'Legacy', layout: { widthPercent: 100 } }], gap: 2 }];
    const result = new TemplateEngine().buildRenderModel(legacy, group);
    const row = result.model?.body?.[0];
    expect(result.errors).toHaveLength(0);
    expect(row?.type).toBe('ROW');
    if (row?.type !== 'ROW') throw new Error('Expected ROW');
    expect(row.columns).toHaveLength(0);
    expect(row.children).toHaveLength(1);
  });
});
