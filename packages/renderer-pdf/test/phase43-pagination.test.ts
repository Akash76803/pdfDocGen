import { describe, expect, it } from 'vitest';
import type { RenderModel, TemplateDefinition, RequiredBlockLayout, RequiredTextStyle } from '@document-tool/contracts';
import { PdfRenderer } from '../src/pdf-renderer.js';

const layout: RequiredBlockLayout = { widthPercent:100, alignment:'LEFT', marginTop:0, marginRight:0, marginBottom:0, marginLeft:0, keepTogether:false, breakBefore:false, breakAfter:false };
const text: RequiredTextStyle = { fontFamily:'Arial', fontSize:9, bold:false, italic:false, underline:false, textColor:'#000000', backgroundColor:'#FFFFFF', alignment:'LEFT', lineHeight:1.2 };

function fixture(repeatHeader = true, repeatFooter = true) {
  const page = { size:'A4' as const, orientation:'PORTRAIT' as const, margins:{top:12,right:12,bottom:12,left:12}, pagination:{repeatHeader,repeatFooter,showPageNumbers:true,pageNumberPosition:'BOTTOM_CENTER' as const} };
  const header = [{id:'h',type:'TEXT' as const,text:'REPEAT HEADER',style:text,layout}];
  const footer = [{id:'f',type:'TEXT' as const,text:'REPEAT FOOTER',style:text,layout}];
  const columns = [
    {id:'c1',label:'Description',path:'description',widthPercent:70,alignment:'LEFT' as const,headerAlignment:'LEFT' as const,headerStyle:text,cellStyle:text},
    {id:'c2',label:'Qty',path:'qty',widthPercent:30,alignment:'RIGHT' as const,headerAlignment:'RIGHT' as const,headerStyle:text,cellStyle:text},
  ];
  const table = {id:'t',type:'TABLE' as const,showHeader:true,showBorder:true,columns,rows:Array.from({length:90},(_,i)=>[`Item ${i+1}`,i+1]),footerRows:[],empty:false,widthPercent:100,alignment:'LEFT' as const,headerStyle:{...text,bold:true},cellStyle:text,border:{width:1,color:'#CBD5E1',style:'SOLID' as const},cellPadding:{top:2,right:2,bottom:2,left:2},layout};
  const model: RenderModel = {variables:{},page,header,body:[table],footer,metadata:{}};
  const template: TemplateDefinition = {id:'t',name:'Pagination',version:1,page,header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]}};
  return {template,model};
}

describe('Phase 4.3 pagination hardening', () => {
  it('renders multiple pages with repeated regions and Page X of Y', async () => {
    const {template,model}=fixture(true,true);
    const out=await new PdfRenderer().render(template,model);
    const pdf=new TextDecoder('latin1').decode(out.content);
    const pages=(pdf.match(/\/Type \/Page\b/g)||[]).length;
    expect(pages).toBeGreaterThan(1);
    expect((pdf.match(/REPEAT HEADER/g)||[]).length).toBe(pages);
    expect((pdf.match(/REPEAT FOOTER/g)||[]).length).toBe(pages);
    expect(pdf).toContain(`Page 1 of ${pages}`);
    expect(pdf).toContain(`Page ${pages} of ${pages}`);
  });

  it('does not repeat document header/footer when disabled', async () => {
    const {template,model}=fixture(false,false);
    const out=await new PdfRenderer().render(template,model);
    const pdf=new TextDecoder('latin1').decode(out.content);
    expect((pdf.match(/REPEAT HEADER/g)||[]).length).toBe(1);
    expect((pdf.match(/REPEAT FOOTER/g)||[]).length).toBe(1);
  });
});
