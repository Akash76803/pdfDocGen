import { describe, expect, it } from 'vitest';
import type { RenderModel, RequiredBlockLayout, RequiredTextStyle, TemplateDefinition } from '@document-tool/contracts';
import { CombinedPdfRenderer, PdfRenderer } from '../src/pdf-renderer.js';

const layout:RequiredBlockLayout={widthPercent:100,alignment:'LEFT',marginTop:0,marginRight:0,marginBottom:1,marginLeft:0,keepTogether:false,breakBefore:false,breakAfter:false};
const text:RequiredTextStyle={fontFamily:'Arial',fontSize:9,bold:false,italic:false,underline:false,textColor:'#000000',backgroundColor:'#FFFFFF',alignment:'LEFT',lineHeight:1.2};
const jpeg='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=';

function fixture(id:string,page:TemplateDefinition['page'],rows=0){
  const body:RenderModel['body']=[{id:'title',type:'TEXT',text:`BODY ${id}`,style:text,layout}];
  if(rows){
    body.push({id:'table',type:'TABLE',showHeader:true,showBorder:true,columns:[{id:'d',label:'Description',path:'d',widthPercent:100,alignment:'LEFT',headerAlignment:'LEFT',headerStyle:text,cellStyle:text}],rows:Array.from({length:rows},(_,i)=>[`Row ${i+1}`]),footerRows:[],empty:false,widthPercent:100,alignment:'LEFT',headerStyle:text,cellStyle:text,border:{width:1,color:'#CBD5E1',style:'SOLID'},cellPadding:{top:2,right:2,bottom:2,left:2},layout});
  }
  const model:RenderModel={variables:{},page,header:[],body,footer:[],metadata:{documentGroupId:id}};
  const template:TemplateDefinition={id:`t-${id}`,name:id,version:1,page,header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]}};
  return {documentGroupId:id,template,model};
}
const pdfText=(bytes:Uint8Array)=>new TextDecoder('latin1').decode(bytes);
const pages=(bytes:Uint8Array)=>(pdfText(bytes).match(/\/Type \/Page\b/g)||[]).length;

describe('UX-7 page watermark system',()=>{
  it('renders a text watermark on every generated PDF page without changing pagination',async()=>{
    const page:TemplateDefinition['page']={size:'A4',orientation:'PORTRAIT',margins:{top:12,right:12,bottom:12,left:12},watermark:{enabled:true,type:'TEXT',text:'CONFIDENTIAL',opacity:.2,rotation:-45,fontSize:42,color:'#64748B',position:'CENTER',applyTo:'ALL',layer:'BEHIND'}};
    const source=fixture('watermark-text',page,90);
    const result=await new PdfRenderer().render(source.template,source.model);
    const pdf=pdfText(result.content),count=pages(result.content);
    expect(count).toBeGreaterThan(1);
    expect((pdf.match(/CONFIDENTIAL/g)||[]).length).toBe(count);
    expect(pdf).toContain('/ExtGState');
  });

  it('supports first-page-only watermark policy',async()=>{
    const page:TemplateDefinition['page']={size:'A4',orientation:'PORTRAIT',margins:{top:12,right:12,bottom:12,left:12},watermark:{enabled:true,type:'TEXT',text:'DRAFT-FIRST',opacity:.25,rotation:0,fontSize:36,color:'#111827',position:'TOP_RIGHT',applyTo:'FIRST_PAGE',layer:'ABOVE'}};
    const source=fixture('first-only',page,90);
    const result=await new PdfRenderer().render(source.template,source.model);
    expect(pages(result.content)).toBeGreaterThan(1);
    expect((pdfText(result.content).match(/DRAFT-FIRST/g)||[]).length).toBe(1);
  });

  it('embeds image watermark resources and preserves them in combined PDFs',async()=>{
    const page:TemplateDefinition['page']={size:'A4',orientation:'PORTRAIT',margins:{top:12,right:12,bottom:12,left:12},watermark:{enabled:true,type:'IMAGE',imageSource:jpeg,opacity:.15,rotation:10,position:'CENTER',scale:.5,applyTo:'ALL',layer:'BEHIND'}};
    const a=fixture('wm-a',page),b=fixture('wm-b',page);
    const result=await new CombinedPdfRenderer().render([a,b]);
    const pdf=pdfText(result.content);
    expect(result.totalPages).toBe(2);
    expect((pdf.match(/\/Subtype \/Image/g)||[]).length).toBe(2);
    expect(pdf).toContain('/D1_Im1');
    expect(pdf).toContain('/D2_Im1');
  });
});
