import { describe, expect, it } from 'vitest';
import type { DocumentGroup, TemplateDefinition } from '@document-tool/contracts';
import { TemplateEngine } from '../src/template-engine.js';

const group: DocumentGroup = {
  id:'g1', key:'INV-1', header:{ invoice:{ number:'INV-1' } }, items:[{amount:100},{amount:50}], sourceItems:[{Amount:100},{Amount:50}], itemDetails:[], sourceRowIndexes:[0,1], warnings:[], valid:true,
};
const base=(block:TemplateDefinition['body']['blocks'][number]):TemplateDefinition=>({id:'t',name:'Custom Grid',version:1,page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}},header:{blocks:[]},body:{blocks:[block]},footer:{blocks:[]}});

describe('Phase 3.6 custom grid table',()=>{
  it('renders configured rows, columns and merged spans',()=>{
    const block={id:'grid',type:'CUSTOM_TABLE' as const,rowCount:2,columnCount:3,cells:[
      {id:'a',row:0,column:0,colSpan:2,rowSpan:1,content:{type:'TEXT' as const,text:'Invoice Details'}},
      {id:'b',row:0,column:1,content:{type:'BLANK' as const}},
      {id:'c',row:0,column:2,rowSpan:2,content:{type:'FIELD' as const,path:'invoice.number'}},
      {id:'d',row:1,column:0,content:{type:'TEXT' as const,text:'Total'}},
      {id:'e',row:1,column:1,content:{type:'VALUE' as const,value:{operation:'SUM' as const,path:'items.amount',sourceField:'Amount',targetPath:'items.amount',decimals:2}}},
      {id:'f',row:1,column:2,content:{type:'BLANK' as const}},
    ],tableStyle:{showBorder:true}};
    const result=new TemplateEngine().buildRenderModel(base(block),group);
    expect(result.errors).toHaveLength(0);
    const rendered=result.model!.body![0];
    if(rendered.type!=='CUSTOM_TABLE') throw new Error('Expected CUSTOM_TABLE');
    expect(rendered.rowCount).toBe(2); expect(rendered.columnCount).toBe(3); expect(rendered.showBorder).toBe(true);
    expect(rendered.cells.find(c=>c.id==='a')?.colSpan).toBe(2);
    expect(rendered.cells.find(c=>c.id==='c')?.rowSpan).toBe(2);
    expect(rendered.cells.find(c=>c.id==='c')?.content.value).toBe('INV-1');
    expect(rendered.cells.find(c=>c.id==='e')?.content.value).toBe('150.00');
  });

  it('rejects spans outside the configured grid',()=>{
    const block={id:'grid',type:'CUSTOM_TABLE' as const,rowCount:2,columnCount:2,cells:[{id:'a',row:1,column:1,rowSpan:2,colSpan:1,content:{type:'BLANK' as const}}]};
    const validation=new TemplateEngine().validate(base(block));
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e=>e.code==='CUSTOM_TABLE_SPAN_INVALID')).toBe(true);
  });
});
