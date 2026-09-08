import { describe, expect, it } from 'vitest';
import { TemplateEngine } from '../src/template-engine.js';
import type { DocumentGroup, TemplateDefinition } from '@document-tool/contracts';

const group: DocumentGroup = { id:'g1', key:'g1', header:{ customer:{name:'ABC Ltd'}, tax:{rate:.18}, total:1250 }, items:[], sourceItems:[] } as any;
const base: TemplateDefinition = { id:'t1', name:'Rich', page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}}, header:{blocks:[]}, body:{blocks:[]}, footer:{blocks:[]} } as any;

describe('Phase 4.11 rich dynamic text',()=>{
  it('preserves newlines and resolves multiple fields',()=>{
    const template={...base,body:{blocks:[{id:'txt',type:'TEXT',text:'Dear {{customer.name}},\n\nGST: {{tax.rate}}',fieldTokens:{'tax.rate':{format:{type:'PERCENT',percentInputMode:'FRACTION',decimals:0}}}}]}} as any;
    const result=new TemplateEngine().buildRenderModel(template,group);
    expect(result.errors).toEqual([]);
    const block=result.model!.body[0] as any;
    expect(block.text).toBe('Dear ABC Ltd,\n\nGST: 18%');
  });
  it('uses token fallback and warns for missing path',()=>{
    const template={...base,body:{blocks:[{id:'txt',type:'TEXT',text:'Name: {{missing.name}}',fieldTokens:{'missing.name':{fallback:'-'}}}]}} as any;
    const result=new TemplateEngine().buildRenderModel(template,group);
    expect((result.model!.body[0] as any).text).toBe('Name: -');
    expect(result.warnings.some(w=>w.code==='FIELD_VALUE_MISSING')).toBe(true);
  });
  it('keeps malformed tokens literal',()=>{
    const template={...base,body:{blocks:[{id:'txt',type:'TEXT',text:'Hello {{customer.name'}]}} as any;
    const result=new TemplateEngine().buildRenderModel(template,group);
    expect((result.model!.body[0] as any).text).toBe('Hello {{customer.name');
  });
});
