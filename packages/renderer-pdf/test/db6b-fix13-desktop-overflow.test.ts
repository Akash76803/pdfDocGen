import { describe, expect, it } from 'vitest';
import type { RenderModel, RequiredBlockLayout, RequiredTextStyle, TemplateDefinition } from '@document-tool/contracts';
import { PdfRenderer } from '../src/pdf-renderer.js';

const text: RequiredTextStyle = {
  fontFamily:'Arial', fontSize:8, bold:false, italic:false, underline:false,
  textColor:'#000000', backgroundColor:'#FFFFFF', alignment:'LEFT', lineHeight:1.2,
};
const flowLayout = (yMm:number,heightMm:number):RequiredBlockLayout => ({
  widthPercent:100, alignment:'LEFT', marginTop:0, marginRight:0, marginBottom:0, marginLeft:0,
  keepTogether:false, breakBefore:false, breakAfter:false, positionMode:'FLOW',
  xMm:12, yMm, widthMm:186, heightMm, pageIndex:0,
});
const absoluteLayout = (xMm:number,yMm:number,widthMm:number,heightMm:number):RequiredBlockLayout => ({
  widthPercent:100, alignment:'LEFT', marginTop:0, marginRight:0, marginBottom:0, marginLeft:0,
  keepTogether:true, breakBefore:false, breakAfter:false, positionMode:'ABSOLUTE',
  xMm,yMm,widthMm,heightMm,pageIndex:0,
});

describe('DB-6B Fix13 desktop dynamic-table overflow', () => {
  it('paginates FLOW tables, repeats table headers, and reflows post-table content without overlap', async () => {
    const page = {
      size:'A4' as const, orientation:'PORTRAIT' as const,
      margins:{top:5,right:10,bottom:5,left:10},
      pagination:{repeatHeader:false,headerMode:'FIRST_PAGE_ONLY' as const,footerMode:'FLOW' as const,showPageNumbers:false},
    };
    const columns = [
      {id:'c1',label:'Product Description',path:'description',widthPercent:72,alignment:'LEFT' as const,headerAlignment:'LEFT' as const,headerStyle:{...text,bold:true},cellStyle:text},
      {id:'c2',label:'Qty',path:'qty',widthPercent:28,alignment:'RIGHT' as const,headerAlignment:'RIGHT' as const,headerStyle:{...text,bold:true},cellStyle:text},
    ];
    const table = {
      id:'items',type:'TABLE' as const,showHeader:true,showBorder:true,columns,
      rows:Array.from({length:80},(_,i)=>[
        `ITEM ${String(i+1).padStart(2,'0')} ${i%5===0?'WITH A LONG DESCRIPTION THAT WRAPS TO A SECOND LINE':''}`,
        i+1,
      ]),
      footerRows:[{id:'total',backgroundColor:'#FFFFFF',cells:[
        {id:'label',columnId:'c1',colspan:1,value:'Total',alignment:'LEFT' as const,style:{...text,bold:true}},
        {id:'value',columnId:'c2',colspan:1,value:'3240',alignment:'RIGHT' as const,style:{...text,bold:true}},
      ]}],
      empty:false,widthPercent:100,alignment:'LEFT' as const,headerStyle:{...text,bold:true},cellStyle:text,
      border:{width:1,color:'#111827',style:'SOLID' as const},cellPadding:{top:1,right:1,bottom:1,left:1},
      layout:flowLayout(55,35),
    };
    const post = {id:'post',type:'TEXT' as const,text:'POST TABLE SUMMARY',style:{...text,bold:true},layout:flowLayout(92,10)};
    const header = {id:'master-header',type:'TEXT' as const,text:'MASTER HEADER',style:{...text,bold:true},layout:absoluteLayout(12,8,186,10)};
    const footer = {id:'master-footer',type:'TEXT' as const,text:'__DB_PAGE_NUMBER__ and __DB_TOTAL_PAGES__',style:text,layout:absoluteLayout(12,285,60,8)};
    const model:RenderModel={variables:{},page,header:[header],body:[table,post],footer:[footer],metadata:{}};
    const template:TemplateDefinition={
      id:'fix13',name:'Fix13 Overflow',version:1,page,
      header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]},
      metadata:{desktopAbsoluteLayout:true,builderPageCount:1,desktopBodyTopMm:25,desktopBodyBottomMm:20},
    };

    const out=await new PdfRenderer().render(template,model);
    const pdf=new TextDecoder('latin1').decode(out.content);
    const pages=(pdf.match(/\/Type \/Page\b/g)||[]).length;
    expect(pages).toBeGreaterThan(1);
    expect((pdf.match(/Product Description/g)||[]).length).toBe(pages);
    expect((pdf.match(/MASTER HEADER/g)||[]).length).toBe(pages);
    expect(pdf).toContain(`1 and ${pages}`);
    expect(pdf).toContain(`${pages} and ${pages}`);
    expect((pdf.match(/POST TABLE SUMMARY/g)||[]).length).toBe(1);
    expect(pdf.indexOf('POST TABLE SUMMARY')).toBeGreaterThan(pdf.indexOf('ITEM 80'));
  });
});
