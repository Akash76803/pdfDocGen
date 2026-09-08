import { describe, expect, it } from 'vitest';
import type { DocumentGroup, TemplateDefinition } from '@document-tool/contracts';
import { TemplateEngine } from '../src/template-engine.js';
import { rawSourceBindingPath } from '../src/raw-source-path.js';

const group:DocumentGroup={
  id:'g-freight',key:'INV-F',valid:true,warnings:[],sourceRowIndexes:[1,2,3],itemDetails:[],header:{customer:'ABC'},
  items:[
    {id:'p1',type:'PRODUCT',product:'A',amount:1000},
    {id:'p2',type:'PRODUCT',product:'B',amount:500},
    {id:'f1',type:'FREIGHT',product:'Freight',amount:200},
  ],
  sourceItems:[
    {Product:'A',Amount:1000},{Product:'B',Amount:500},{Product:'Freight',Amount:200}
  ]
};

const template=():TemplateDefinition=>({
  id:'t413',name:'Freight Views',version:1,
  page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}},header:{blocks:[]},footer:{blocks:[]},
  dataViews:[
    {id:'v-products',name:'Product Lines',alias:'productLines',sourcePath:'items',filter:{path:'type',operator:'NOT_EQUALS',value:'FREIGHT'}},
    {id:'v-freight',name:'Freight Lines',alias:'freightLines',sourcePath:'items',filter:{path:'type',operator:'EQUALS',value:'FREIGHT'}},
  ],
  calculatedFields:[
    {id:'c-products',name:'Product Subtotal',alias:'productSubtotal',value:{operation:'SUM',sourcePath:'views.productLines',path:'amount'}},
    {id:'c-freight',name:'Freight Amount',alias:'freightAmount',value:{operation:'SUM',sourcePath:'views.freightLines',path:'amount'}},
    {id:'c-grand',name:'Grand Total',alias:'grandTotal',value:{operation:'FORMULA',sourcePath:'items',expression:'{{p}} + {{f}}',formulaBindings:[{id:'p',label:'Product subtotal',path:'calc.productSubtotal'},{id:'f',label:'Freight',path:'calc.freightAmount'}]}},
  ],
  body:{blocks:[
    {id:'products',type:'TABLE',sourcePath:'items',rowFilter:{path:'type',operator:'NOT_EQUALS',value:'FREIGHT'},columns:[{id:'product',label:'Product',path:'product'},{id:'amount',label:'Amount',path:'amount'}],footerRows:[{id:'total',cells:[{id:'total-label',columnId:'product',value:{operation:'STATIC',staticValue:'Total'}},{id:'total-amount',columnId:'amount',value:{operation:'SUM',path:'amount'}}]}]},
    {id:'freight-text',type:'TEXT',text:'Subtotal: {{calc.productSubtotal}}\nFreight: {{calc.freightAmount}}\nGrand Total: {{calc.grandTotal}}'},
    {id:'freight-summary',type:'SUMMARY_TABLE',columns:[{id:'label',label:'Label'},{id:'value',label:'Value'}],rows:[{id:'r',cells:[{id:'l',columnId:'label',value:{operation:'STATIC',staticValue:'Freight'}},{id:'v',columnId:'value',value:{operation:'FIELD',path:'calc.freightAmount'}}]}]},
  ]}
});

describe('Phase 4.13 Data Views + Calculated Fields',()=>{
  it('filters freight from a table and calculates footer only from visible rows',()=>{
    const result=new TemplateEngine().buildRenderModel(template(),group);
    expect(result.errors).toEqual([]);
    const table=result.model!.body![0] as any;
    expect(table.rows).toEqual([['A',1000],['B',500]]);
    expect(table.footerRows[0].cells.find((c:any)=>c.columnId==='amount').value).toBe('1500');
    expect((result.model!.variables.items as any[])).toHaveLength(3);
  });

  it('keeps reusable views and calculations available globally',()=>{
    const model=new TemplateEngine().buildRenderModel(template(),group).model!;
    expect((model.variables.views as any).productLines).toHaveLength(2);
    expect((model.variables.views as any).freightLines).toHaveLength(1);
    expect(model.variables.calc).toMatchObject({productSubtotal:1500,freightAmount:200,grandTotal:1700});
    expect((model.body![1] as any).text).toBe('Subtotal: 1500\nFreight: 200\nGrand Total: 1700');
    expect((model.body![2] as any).rows[0].cells[1].value).toBe('200');
  });

  it('sums multiple matching freight rows and returns zero for an empty view',()=>{
    const multi={...group,items:[...group.items,{id:'f2',type:'FREIGHT',product:'Freight 2',amount:50}]};
    const model=new TemplateEngine().buildRenderModel(template(),multi as DocumentGroup).model!;
    expect((model.variables.calc as any).freightAmount).toBe(250);
    const noFreight={...group,items:group.items.filter((row:any)=>row.type!=='FREIGHT')};
    const noFreightModel=new TemplateEngine().buildRenderModel(template(),noFreight as DocumentGroup).model!;
    expect((noFreightModel.variables.views as any).freightLines).toEqual([]);
    expect((noFreightModel.variables.calc as any).freightAmount).toBe(0);
  });

  it('supports chained Data Views without modifying the parent view',()=>{
    const t=template();
    t.dataViews!.push({id:'v-big-products',name:'Big Products',alias:'bigProducts',sourcePath:'views.productLines',filter:{path:'amount',operator:'GREATER_THAN',value:700}});
    const model=new TemplateEngine().buildRenderModel(t,group).model!;
    expect((model.variables.views as any).productLines).toHaveLength(2);
    expect((model.variables.views as any).bigProducts).toEqual([{id:'p1',type:'PRODUCT',product:'A',amount:1000}]);
  });

  it('detects Data View and calculated-field dependency cycles',()=>{
    const dataCycle=template();
    dataCycle.dataViews=[{id:'a',name:'A',alias:'a',sourcePath:'views.b'},{id:'b',name:'B',alias:'b',sourcePath:'views.a'}];
    expect(new TemplateEngine().validate(dataCycle).errors.some((e)=>e.code==='DATA_VIEW_CYCLE')).toBe(true);

    const calcCycle=template();
    calcCycle.calculatedFields=[
      {id:'ca',name:'A',alias:'a',value:{operation:'FIELD',path:'calc.b'}},
      {id:'cb',name:'B',alias:'b',value:{operation:'FIELD',path:'calc.a'}},
    ];
    expect(new TemplateEngine().validate(calcCycle).errors.some((e)=>e.code==='CALCULATED_FIELD_CYCLE')).toBe(true);
  });

  it('keeps old templates backward compatible when no views/calculations/row filter exist',()=>{
    const legacy=template(); delete legacy.dataViews; delete legacy.calculatedFields;
    const table=legacy.body.blocks[0] as any; delete table.rowFilter;
    const model=new TemplateEngine().buildRenderModel(legacy,group).model!;
    expect((model.body![0] as any).rows).toHaveLength(3);
  });

  it('returns a controlled render error when a Data View source is not an array',()=>{
    const invalid=template();
    invalid.dataViews=[{id:'invalid',name:'Invalid Source',alias:'view_1',sourcePath:'fields'}];
    const invalidGroup={...group,header:{...group.header,fields:{not:'an array'}}};
    const build=()=>new TemplateEngine().buildRenderModel(invalid,invalidGroup as DocumentGroup);
    expect(build).not.toThrow();
    const result=build();
    expect(result.model).toBeNull();
    expect(result.errors).toEqual([{code:'TEMPLATE_RENDER_FAILED',message:'Data View view_1 source fields is not an array.'}]);
  });
});

describe('Phase 4.13 Data View imported raw-field filtering',()=>{
  it('filters normalized item rows by an aligned imported text field',()=>{
    const t=template();
    t.dataViews=[{id:'v-freight-raw',name:'Freight Rows',alias:'freightRows',sourcePath:'items',filter:{path:rawSourceBindingPath('Product Name'),operator:'EQUALS',value:'Freight'}}];
    t.calculatedFields=[{id:'c-freight-raw',name:'Freight Amount',alias:'freightAmount',value:{operation:'SUM',sourcePath:'views.freightRows',path:'amount'}}];
    const withRawHeaders={...group,sourceItems:[
      {'Product Name':'Product A',Quantity:1,Amount:1000},
      {'Product Name':'Product B',Quantity:2,Amount:500},
      {'Product Name':'Freight',Quantity:1,Amount:200},
    ]};
    const result=new TemplateEngine().buildRenderModel(t,withRawHeaders as DocumentGroup);
    expect(result.errors).toHaveLength(0);
    expect((result.model!.variables.views as any).freightRows).toEqual([{id:'f1',type:'FREIGHT',product:'Freight',amount:200}]);
    expect((result.model!.variables.calc as any).freightAmount).toBe(200);
  });

  it('supports CONTAINS and blank imported text values through raw-row context',()=>{
    const t=template();
    t.dataViews=[
      {id:'v-freight-contains',name:'Freight Contains',alias:'freightContains',sourcePath:'items',filter:{path:rawSourceBindingPath('Product Name'),operator:'CONTAINS',value:'fre'}},
      {id:'v-empty-note',name:'Empty Notes',alias:'emptyNotes',sourcePath:'items',filter:{path:rawSourceBindingPath('Note'),operator:'IS_EMPTY'}},
    ];
    t.calculatedFields=[];
    const rawGroup={...group,sourceItems:[
      {'Product Name':'Product A',Note:'ok'},
      {'Product Name':'Product B',Note:''},
      {'Product Name':'Freight Charge',Note:null},
    ]};
    const model=new TemplateEngine().buildRenderModel(t,rawGroup as DocumentGroup).model!;
    expect((model.variables.views as any).freightContains).toEqual([{id:'f1',type:'FREIGHT',product:'Freight',amount:200}]);
    expect((model.variables.views as any).emptyNotes).toEqual([group.items[1],group.items[2]]);
  });
});
