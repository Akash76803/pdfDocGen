import { describe, expect, it } from 'vitest';
import type { DocumentGroup, TemplateDefinition, TableBlock } from '@document-tool/contracts';
import { TemplateEngine } from '../src/template-engine.js';

const group:DocumentGroup={
  id:'g1',key:'INV-1',valid:true,warnings:[],sourceRowIndexes:[1,2],itemDetails:[],
  header:{gst:{type:'LOCAL'},discountRate:0.18},
  items:[{id:'r1',product:'A',qty:2,rate:100,image:'data:image/png;base64,iVBORw0KGgo='},{id:'r2',product:'B',qty:3,rate:50,image:'data:image/png;base64,iVBORw0KGgo='}],
  sourceItems:[]
};
const base=(table:TableBlock):TemplateDefinition=>({id:'t',name:'T',version:1,page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}},header:{blocks:[]},body:{blocks:[table]},footer:{blocks:[]}});

describe('Phase 4.10 advanced table columns',()=>{
  it('formats fractional percentages as human percentages',()=>{
    const t=base({id:'tb',type:'TABLE',sourcePath:'items',columns:[{id:'pct',label:'Tax %',path:'rate',kind:'STATIC_TEXT',staticValue:0.18,format:{type:'PERCENT',percentInputMode:'FRACTION'}}]});
    const b=new TemplateEngine().buildRenderModel(t,group).model!.body[0];
    expect(b.type).toBe('TABLE'); if(b.type==='TABLE') expect(b.rows[0]?.[0]).toBe('18%');
  });
  it('conditionally removes a whole column using document-level data',()=>{
    const table:TableBlock={id:'tb',type:'TABLE',sourcePath:'items',columns:[
      {id:'p',label:'Product',path:'product'},
      {id:'igst',label:'IGST',path:'rate',visibility:{path:'gst.type',operator:'EQUALS',value:'IGST'}},
      {id:'local',label:'CGST/SGST',path:'rate',visibility:{path:'gst.type',operator:'EQUALS',value:'LOCAL'}}
    ]};
    const b=new TemplateEngine().buildRenderModel(base(table),group).model!.body[0];
    expect(b.type).toBe('TABLE'); if(b.type==='TABLE') expect(b.columns.map(c=>c.id)).toEqual(['p','local']);
  });
  it('resolves row number, formula, image and QR custom columns per row',()=>{
    const table:TableBlock={id:'tb',type:'TABLE',sourcePath:'items',columns:[
      {id:'n',label:'#',path:'',kind:'ROW_NUMBER'},
      {id:'f',label:'Amount',path:'',kind:'FORMULA',formulaExpression:'{{q}} * {{r}}',formulaBindings:[{id:'q',label:'Qty',path:'qty'},{id:'r',label:'Rate',path:'rate'}],format:{type:'NUMBER',decimals:0}},
      {id:'img',label:'Image',path:'image',kind:'IMAGE'},
      {id:'qr',label:'QR',path:'id',kind:'QR',qr:{errorCorrection:'M',widthMm:16,heightMm:16}}
    ]};
    const b=new TemplateEngine().buildRenderModel(base(table),group).model!.body[0];
    expect(b.type).toBe('TABLE'); if(b.type==='TABLE'){
      expect(b.rows[0]?.[0]).toBe(1);
      expect(b.rows[0]?.[1]).toBe('200');
      expect(String(b.rows[0]?.[2])).toMatch(/^data:image\/png/);
      expect(String(b.rows[0]?.[3])).toMatch(/^data:image\/svg\+xml/);
    }
  });
  it('resolves grouped header colspan into the RenderModel',()=>{
    const table:TableBlock={id:'tb',type:'TABLE',sourcePath:'items',columns:[{id:'p',label:'Product',path:'product'},{id:'q',label:'Qty',path:'qty'},{id:'r',label:'Rate',path:'rate'}],headerGroups:[{id:'hg',label:'Commercial',startColumnId:'q',colspan:2}]};
    const b=new TemplateEngine().buildRenderModel(base(table),group).model!.body[0];
    expect(b.type).toBe('TABLE'); if(b.type==='TABLE') expect(b.headerGroups?.[0]).toMatchObject({label:'Commercial',startColumnId:'q',colspan:2});
  });
});
