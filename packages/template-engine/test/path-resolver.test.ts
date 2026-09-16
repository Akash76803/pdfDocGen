import { describe, expect, it, test } from 'vitest';
import { resolvePath } from '../src/path-resolver.js';
describe('safe path resolver',()=>{
 it('resolves nested, numeric and boolean values',()=>{const x={a:{b:2,c:false}};expect(resolvePath(x,'a.b')).toEqual({found:true,value:2});expect(resolvePath(x,'a.c')).toEqual({found:true,value:false});});
 it('returns controlled missing and null values',()=>{expect(resolvePath({a:null},'a')).toEqual({found:true,value:null});expect(resolvePath({},'a.b').found).toBe(false);});
 it.each(['__proto__','constructor.prototype','prototype.x'])('blocks unsafe path %s',(p)=>expect(resolvePath({},p).found).toBe(false));
 it('respects maximum depth',()=>expect(resolvePath({a:{b:{c:1}}},'a.b.c',2).found).toBe(false));
});

import { TemplateEngine } from '../src/template-engine.js';
import type { DocumentGroup, TemplateDefinition } from '@document-tool/contracts';

test('render model resolves legacy business labels against API-safe request keys and system pagination aliases', () => {
  const template: TemplateDefinition = {
    id: 'legacy-field-template', name: 'Legacy field template', version: 1,
    page: { size: 'A4', orientation: 'PORTRAIT', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
    header: { blocks: [
      { id: 'h1', type: 'FIELD', path: 'invoiceNo' },
      { id: 'h2', type: 'TEXT', text: '{{Customer: Account Name}} · Page {{pageNumber}} of {{totalPages}}' },
    ] },
    body: { blocks: [] }, footer: { blocks: [] },
  };
  const data: DocumentGroup = {
    id: 'g1', key: 'g1',
    header: { invoiceNo: 'INV-1001', customerAccountName: 'Akash Industries' },
    items: [], itemDetails: {}, sourceItems: [],
  };
  const result = new TemplateEngine().buildRenderModel(template, data);
  expect(result.errors).toEqual([]);
  expect(result.warnings).toEqual([]);
  expect(result.model?.header?.[0]?.type).toBe('FIELD');
  expect(result.model?.header?.[1]?.type).toBe('TEXT');
  const field = result.model?.header?.[0];
  const text = result.model?.header?.[1];
  if (field?.type !== 'FIELD' || text?.type !== 'TEXT') throw new Error('Unexpected block types');
  expect(field.value).toBe('INV-1001');
  expect(text.text).toBe('Akash Industries · Page 1 of 1');
});
