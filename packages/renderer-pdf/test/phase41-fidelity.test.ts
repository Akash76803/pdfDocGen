import { describe, expect, it } from 'vitest';
import type { RenderModel, TemplateDefinition } from '@document-tool/contracts';
import { PdfRenderer } from '../src/pdf-renderer.js';

const style = { fontFamily:'Arial',fontSize:10,bold:false,italic:false,underline:false,textColor:'#000000',backgroundColor:'#FFFFFF',alignment:'LEFT',lineHeight:1.2 } as const;
const layout = { widthPercent:100,alignment:'LEFT',marginTop:0,marginRight:0,marginBottom:0,marginLeft:0 } as const;
const page = { size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10} } as const;
const template:TemplateDefinition={id:'t',name:'Fidelity',version:1,page,header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]}};

describe('Phase 4.1 PDF fidelity', () => {
  it('honors centered text alignment by emitting a translated text position', async () => {
    const model:RenderModel={variables:{},page,header:[],body:[{id:'t',type:'TEXT',text:'CENTERED',style:{...style,alignment:'CENTER',fontSize:18},layout}],footer:[],metadata:{}};
    const out=await new PdfRenderer().render(template,model);
    const text=new TextDecoder().decode(out.content);
    expect(text).toContain('(CENTERED) Tj');
    expect(text).toMatch(/1 0 0 1 \d+(?:\.\d+)? \d+(?:\.\d+)? Tm \(CENTERED\)/);
  });

  it('wraps long table headers and keeps repeated headers on multi-page tables', async () => {
    const rows=Array.from({length:90},(_,i)=>[`Item ${i+1}`,i+1]);
    const table={id:'table',type:'TABLE',showHeader:true,showBorder:true,columns:[
      {id:'p',label:'Description of Goods and Services',path:'p',widthPercent:70,alignment:'LEFT',headerAlignment:'CENTER',headerStyle:{...style,bold:true},cellStyle:style},
      {id:'q',label:'Total Quantity',path:'q',widthPercent:30,alignment:'RIGHT',headerAlignment:'CENTER',headerStyle:{...style,bold:true},cellStyle:style},
    ],rows,footerRows:[],empty:false,widthPercent:100,alignment:'LEFT',headerStyle:{...style,bold:true,backgroundColor:'#F3F4F6'},cellStyle:style,border:{width:.5,color:'#CBD5E1',style:'SOLID'},cellPadding:{top:1,right:1,bottom:1,left:1},layout} as const;
    const model:RenderModel={variables:{},page,header:[],body:[table],footer:[],metadata:{}};
    const out=await new PdfRenderer().render(template,model);const text=new TextDecoder().decode(out.content);
    expect((text.match(/Description of Goods/g)??[]).length).toBeGreaterThanOrEqual(2);
    expect((text.match(/\/Type \/Page\b/g)??[]).length).toBeGreaterThanOrEqual(2);
  });

  it('renders summary rows with enough height for wrapped labels instead of clipping them', async () => {
    const summary={id:'sum',type:'SUMMARY_TABLE',title:'',showHeader:false,showBorder:true,columns:[
      {id:'l',label:'Label',widthPercent:40,alignment:'LEFT',headerAlignment:'LEFT',style},
      {id:'v',label:'Value',widthPercent:60,alignment:'LEFT',headerAlignment:'LEFT',style},
    ],rows:[{id:'r',cells:[
      {id:'a',columnId:'l',value:'TOTAL TAX AMOUNT (IN WORDS):',alignment:'LEFT',style:{...style,bold:true}},
      {id:'b',columnId:'v',value:'Nine Thousand Five Hundred Eighty Eight and Fifteen Paise',alignment:'LEFT',style},
    ],style,backgroundColor:'#FFFFFF',bold:false}],widthPercent:100,alignment:'LEFT',headerStyle:{...style,bold:true},cellStyle:style,border:{width:.5,color:'#CBD5E1',style:'SOLID'},cellPadding:{top:1.5,right:2,bottom:1.5,left:2},layout} as const;
    const model:RenderModel={variables:{},page,header:[],body:[summary],footer:[],metadata:{}};
    const out=await new PdfRenderer().render(template,model);const text=new TextDecoder().decode(out.content);
    expect(text).toContain('TOTAL TAX AMOUNT');
    expect(text).toContain('Fifteen Paise');
  });
});

it('applies summary table width once so Engine PDF matches preview width instead of shrink-wrapping', async () => {
  const summaryLayout = { ...layout, widthPercent:50, alignment:'RIGHT' as const };
  const summary={id:'sum-width',type:'SUMMARY_TABLE',title:'',showHeader:true,showBorder:true,columns:[
    {id:'a',label:'HSN',widthPercent:50,alignment:'LEFT',headerAlignment:'LEFT',style},
    {id:'b',label:'Taxable Amount',widthPercent:50,alignment:'RIGHT',headerAlignment:'RIGHT',style},
  ],rows:[{id:'r',cells:[
    {id:'a1',columnId:'a',value:'73201020',alignment:'LEFT',style},
    {id:'b1',columnId:'b',value:'₹9,588.15',alignment:'RIGHT',style},
  ],style,backgroundColor:'#FFFFFF',bold:false}],widthPercent:50,alignment:'RIGHT',headerStyle:{...style,bold:true},cellStyle:style,border:{width:.5,color:'#CBD5E1',style:'SOLID'},cellPadding:{top:1,right:1,bottom:1,left:1},layout:summaryLayout} as const;
  const model:RenderModel={variables:{},page,header:[],body:[summary],footer:[],metadata:{}};
  const out=await new PdfRenderer().render(template,model);
  const text=new TextDecoder().decode(out.content);
  // A4 content width with 10mm margins is ~538.583pt. A 50% summary is
  // ~269.291pt, therefore each 50% column is ~134.646pt. The old bug
  // applied 50% a second time and emitted ~67.323pt columns.
  expect(text).toContain('134.646');
  expect(text).not.toContain('67.323');
});

it('keeps currency summary values on one line and lets auto-like summary widths protect short tax columns', async () => {
  const columns=[
    {id:'hsn',label:'HSN',widthPercent:17,alignment:'CENTER',headerAlignment:'CENTER',style},
    {id:'gst',label:'GST',widthPercent:12,alignment:'CENTER',headerAlignment:'CENTER',style},
    {id:'tax',label:'Taxable Amt.',widthPercent:18,alignment:'RIGHT',headerAlignment:'CENTER',style},
    {id:'sgst',label:'SGST',widthPercent:12,alignment:'RIGHT',headerAlignment:'CENTER',style},
    {id:'cgst',label:'CGST',widthPercent:12,alignment:'RIGHT',headerAlignment:'CENTER',style},
    {id:'igst',label:'IGST',widthPercent:11,alignment:'RIGHT',headerAlignment:'CENTER',style},
    {id:'total',label:'Total',widthPercent:18,alignment:'RIGHT',headerAlignment:'CENTER',style},
  ] as const;
  const values=['73201020','18.00%','₹9,588.15','₹862.93','₹862.93','₹0.00','₹11,314.01'];
  const summary={id:'tax-summary',type:'SUMMARY_TABLE',title:'',showHeader:true,showBorder:true,columns,rows:[{id:'r',cells:columns.map((c,i)=>({id:`c${i}`,columnId:c.id,value:values[i],alignment:c.alignment,style})),style,backgroundColor:'#FFFFFF',bold:false}],widthPercent:100,alignment:'LEFT',headerStyle:{...style,bold:true},cellStyle:style,border:{width:.5,color:'#CBD5E1',style:'SOLID'},cellPadding:{top:1,right:1,bottom:1,left:1},layout} as const;
  const model:RenderModel={variables:{},page,header:[],body:[summary],footer:[],metadata:{}};
  const out=await new PdfRenderer().render(template,model);
  const text=new TextDecoder().decode(out.content);
  expect(text).toContain('(9,588.15) Tj');
  expect(text).not.toContain('(Rs. 9,588.15) Tj');
  expect(text).toContain('(11,314.01) Tj');
  expect(text).not.toContain('(Rs. 11,314.01) Tj');
  expect(text).toContain('(SGST) Tj');
  expect(text).toContain('(CGST) Tj');
});
