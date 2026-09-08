import { describe, expect, it } from 'vitest';
import type { DocumentGroup, TemplateDefinition } from '@document-tool/contracts';
import { TemplateEngine } from '../src/template-engine.js';

const group: DocumentGroup = {
  id: 'g1', key: 'INV-1', header: {}, items: [{ name: 'A', amount: 10 }], sourceItems: [{ Name: 'A', Amount: 10 }],
  itemDetails: [], sourceRowIndexes: [0], warnings: [], valid: true,
};

const base = (body: TemplateDefinition['body']['blocks']): TemplateDefinition => ({
  id: 't1', name: 'Visibility', version: 1,
  page: { size: 'A4', orientation: 'PORTRAIT', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
  header: { blocks: [] }, body: { blocks: body }, footer: { blocks: [] },
});

describe('Phase 3.6 table visibility', () => {
  it('normal TABLE defaults header and border ON', () => {
    const block = { id:'table', type:'TABLE' as const, sourcePath:'items', columns:[{id:'c',label:'Name',path:'name'}] };
    const model = new TemplateEngine().buildRenderModel(base([block]), group).model!;
    const rendered = model.body![0];
    expect(rendered.type).toBe('TABLE');
    if (rendered.type !== 'TABLE') return;
    expect(rendered.showHeader).toBe(true);
    expect(rendered.showBorder).toBe(true);
  });

  it('normal TABLE preserves header/border OFF independently', () => {
    const block = { id:'table', type:'TABLE' as const, sourcePath:'items', tableStyle:{showHeader:false,showBorder:false}, columns:[{id:'c',label:'Name',path:'name'}] };
    const model = new TemplateEngine().buildRenderModel(base([block]), group).model!;
    const rendered = model.body![0];
    if (rendered.type !== 'TABLE') throw new Error('Expected TABLE');
    expect(rendered.showHeader).toBe(false);
    expect(rendered.showBorder).toBe(false);
  });

  it('SUMMARY_TABLE keeps legacy block showHeader and common border toggle', () => {
    const block = {
      id:'summary', type:'SUMMARY_TABLE' as const, dataMode:'MANUAL' as const, sourcePath:'items', showHeader:false,
      tableStyle:{showBorder:false}, columns:[{id:'l',label:'Label'},{id:'v',label:'Value'}], rows:[]
    };
    const model = new TemplateEngine().buildRenderModel(base([block]), group).model!;
    const rendered = model.body![0];
    if (rendered.type !== 'SUMMARY_TABLE') throw new Error('Expected SUMMARY_TABLE');
    expect(rendered.showHeader).toBe(false);
    expect(rendered.showBorder).toBe(false);
  });
});
