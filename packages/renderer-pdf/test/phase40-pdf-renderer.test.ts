import { describe, expect, it } from 'vitest';
import type { RenderModel, TemplateDefinition } from '@document-tool/contracts';
import { PdfRenderer } from '../src/pdf-renderer.js';

const style = { fontFamily:'Arial',fontSize:10,bold:false,italic:false,underline:false,textColor:'#000000',backgroundColor:'#FFFFFF',alignment:'LEFT',lineHeight:1.2 } as const;
const layout = { widthPercent:100,alignment:'LEFT',marginTop:0,marginRight:0,marginBottom:0,marginLeft:0 } as const;

describe('Phase 4 PDF core', () => {
  it('generates a valid multi-page PDF and repeats the table header', async () => {
    const rows = Array.from({length:80},(_,i)=>[`Item ${i+1}`,i+1,(i+1)*10]);
    const page = { size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10} } as const;
    const table = {
      id:'table',type:'TABLE',showHeader:true,showBorder:true,
      columns:[
        {id:'p',label:'Product',path:'p',widthPercent:60,alignment:'LEFT',headerAlignment:'LEFT',headerStyle:{...style,bold:true},cellStyle:style},
        {id:'q',label:'Qty',path:'q',widthPercent:20,alignment:'RIGHT',headerAlignment:'RIGHT',headerStyle:{...style,bold:true},cellStyle:style},
        {id:'a',label:'Amount',path:'a',widthPercent:20,alignment:'RIGHT',headerAlignment:'RIGHT',headerStyle:{...style,bold:true},cellStyle:style},
      ], rows, footerRows:[], empty:false,widthPercent:100,alignment:'LEFT',headerStyle:{...style,bold:true,backgroundColor:'#F3F4F6'},cellStyle:style,border:{width:.5,color:'#CBD5E1',style:'SOLID'},cellPadding:{top:1,right:1,bottom:1,left:1},layout
    } as const;
    const model:RenderModel={variables:{},page,header:[{id:'h',type:'TEXT',text:'INVOICE',style:{...style,fontSize:16,bold:true},layout}],body:[table],footer:[{id:'f',type:'TEXT',text:'Footer',style,layout}],metadata:{}};
    const template:TemplateDefinition={id:'t',name:'Invoice',version:1,page,header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]}};
    const out=await new PdfRenderer().render(template,model);
    const text=new TextDecoder().decode(out.content);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((text.match(/Product/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(out.mimeType).toBe('application/pdf');
  });
});
