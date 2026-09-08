import { describe, expect, it } from 'vitest';
import type { DocumentGroup, TemplateDefinition } from '@document-tool/contracts';
import { TemplateEngine } from '../src/template-engine.js';
import { evaluateVisibilityRule } from '../src/condition-evaluator.js';

const group: DocumentGroup = {
  id:'g1', key:'INV-1', valid:true, warnings:[], sourceRowIndexes:[1], itemDetails:[],
  header:{ gst:{type:'LOCAL'}, amount:1200, bank:{name:''}, status:'PAID', customer:{name:'ABC Traders'} },
  items:[{product:'A',qty:2,rate:100}], sourceItems:[]
};

const base=(blocks:any[]):TemplateDefinition=>({
  id:'t412', name:'Conditional', version:1,
  page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}},
  header:{blocks:[]}, body:{blocks}, footer:{blocks:[]}
} as any);

describe('Phase 4.12 conditional visibility rules',()=>{
  it('keeps legacy content visible when no rule exists',()=>{
    const model=new TemplateEngine().buildRenderModel(base([{id:'txt',type:'TEXT',text:'Always'}]),group).model!;
    expect(model.body).toHaveLength(1);
  });

  it('removes a hidden top-level block before RenderModel layout',()=>{
    const model=new TemplateEngine().buildRenderModel(base([
      {id:'show',type:'TEXT',text:'Visible',visibility:{path:'status',operator:'EQUALS',value:'PAID'}},
      {id:'hide',type:'TEXT',text:'Hidden',visibility:{path:'gst.type',operator:'EQUALS',value:'IGST'}}
    ] as any),group).model!;
    expect(model.body.map((b:any)=>b.id)).toEqual(['show']);
  });

  it('supports ALL/ANY groups and negate',()=>{
    const root={status:'PAID',amount:1200,gst:{type:'LOCAL'}};
    expect(evaluateVisibilityRule({logic:'ALL',conditions:[
      {path:'status',operator:'EQUALS',value:'PAID'},
      {path:'amount',operator:'GREATER_THAN',value:1000}
    ]},root)).toBe(true);
    expect(evaluateVisibilityRule({logic:'ANY',negate:true,conditions:[
      {path:'gst.type',operator:'EQUALS',value:'IGST'},
      {path:'status',operator:'EQUALS',value:'CANCELLED'}
    ]},root)).toBe(true);
  });

  it('supports empty/text operators without treating zero/false as empty',()=>{
    const root={empty:'',zero:0,no:false,name:'ABC Traders'};
    expect(evaluateVisibilityRule({path:'empty',operator:'IS_EMPTY'},root)).toBe(true);
    expect(evaluateVisibilityRule({path:'zero',operator:'NOT_EMPTY'},root)).toBe(true);
    expect(evaluateVisibilityRule({path:'no',operator:'NOT_EMPTY'},root)).toBe(true);
    expect(evaluateVisibilityRule({path:'name',operator:'CONTAINS',value:'traders'},root)).toBe(true);
  });

  it('removes hidden nested Row/BOX children without reserving child slots',()=>{
    const model=new TemplateEngine().buildRenderModel(base([{id:'row',type:'ROW',children:[],columns:[
      {id:'c1',children:[
        {id:'visible-field',type:'FIELD',path:'customer.name'},
        {id:'hidden-field',type:'FIELD',path:'bank.name',visibility:{path:'bank.name',operator:'NOT_EMPTY'}}
      ]}
    ]}]),group).model!;
    const row=model.body[0] as any;
    expect(row.columns[0].children.map((child:any)=>child.id)).toEqual(['visible-field']);
  });

  it('uses the same rule engine for table columns and keeps grouped-header colspan aligned',()=>{
    const model=new TemplateEngine().buildRenderModel(base([{id:'tb',type:'TABLE',sourcePath:'items',columns:[
      {id:'p',label:'Product',path:'product'},
      {id:'cgst',label:'CGST',path:'rate',visibility:{path:'gst.type',operator:'EQUALS',value:'LOCAL'}},
      {id:'sgst',label:'SGST',path:'rate',visibility:{path:'gst.type',operator:'EQUALS',value:'LOCAL'}},
      {id:'igst',label:'IGST',path:'rate',visibility:{path:'gst.type',operator:'EQUALS',value:'IGST'}},
      {id:'total',label:'Total',path:'rate'}
    ],headerGroups:[{id:'tax',label:'Tax Details',startColumnId:'cgst',colspan:3}]}]),group).model!;
    const table=model.body[0] as any;
    expect(table.columns.map((c:any)=>c.id)).toEqual(['p','cgst','sgst','total']);
    expect(table.headerGroups[0]).toMatchObject({startColumnId:'cgst',colspan:2});
  });

  it('supports block rules in header/footer as well as body',()=>{
    const template=base([]);
    template.header.blocks=[{id:'h',type:'TEXT',text:'Header',visibility:{path:'status',operator:'EQUALS',value:'PAID'}}] as any;
    template.footer.blocks=[{id:'f',type:'TEXT',text:'Footer',visibility:{path:'status',operator:'EQUALS',value:'CANCELLED'}}] as any;
    const model=new TemplateEngine().buildRenderModel(template,group).model!;
    expect(model.header.map((b:any)=>b.id)).toEqual(['h']);
    expect(model.footer).toHaveLength(0);
  });
});

describe('type-aware date comparisons',()=>{
  it('compares ISO date values for Data View/visibility rules',()=>{
    expect(evaluateVisibilityRule({path:'date',operator:'GREATER_THAN',value:'2026-08-21'},{date:'2026-08-22'})).toBe(true);
    expect(evaluateVisibilityRule({path:'date',operator:'LESS_OR_EQUAL',value:'2026-08-22'},{date:'2026-08-22'})).toBe(true);
  });
});
