import { describe, expect, it } from 'vitest';
import type { RenderModel, RequiredBlockLayout, RequiredTextStyle, TemplateDefinition } from '@document-tool/contracts';
import { PdfRenderer } from '../src/pdf-renderer.js';

const layout:RequiredBlockLayout={widthPercent:100,alignment:'LEFT',marginTop:0,marginRight:0,marginBottom:0,marginLeft:0,keepTogether:false,breakBefore:false,breakAfter:false};
const text:RequiredTextStyle={fontFamily:'Arial',fontSize:9,bold:false,italic:false,underline:false,textColor:'#000000',backgroundColor:'#FFFFFF',alignment:'LEFT',lineHeight:1.2};
const page={size:'A4' as const,orientation:'PORTRAIT' as const,margins:{top:12,right:12,bottom:12,left:12},pagination:{repeatHeader:true,repeatFooter:true,showPageNumbers:true,pageNumberPosition:'BOTTOM_CENTER' as const,footerMode:'REPEAT_PAGE' as const}};

function table(rows=3){
  const columns=[
    {id:'d',label:'Description',path:'d',widthPercent:70,alignment:'LEFT' as const,headerAlignment:'LEFT' as const,headerStyle:text,cellStyle:text},
    {id:'a',label:'Amount',path:'a',widthPercent:30,alignment:'RIGHT' as const,headerAlignment:'RIGHT' as const,headerStyle:text,cellStyle:text},
  ];
  return {id:'table',type:'TABLE' as const,showHeader:true,showBorder:true,columns,rows:Array.from({length:rows},(_,i)=>[`Item ${i+1}`,14839.02+i]),footerRows:[{id:'total',cells:[{id:'l',colspan:1,value:'Total',alignment:'RIGHT' as const,style:{...text,bold:true}},{id:'v',colspan:1,value:'38922.31',alignment:'RIGHT' as const,style:{...text,bold:true}}],style:text,backgroundColor:'#FFFFFF'}],empty:false,widthPercent:100,alignment:'LEFT' as const,headerStyle:text,cellStyle:text,border:{width:1,color:'#CBD5E1',style:'SOLID' as const},cellPadding:{top:2,right:2,bottom:2,left:2},layout};
}

function fixture(body:RenderModel['body']){
  const model:RenderModel={variables:{},page,header:[{id:'h',type:'TEXT',text:'HEADER',style:text,layout}],body,footer:[{id:'f',type:'TEXT',text:'FOOTER',style:text,layout}],metadata:{documentGroupId:'g-1'}};
  const template:TemplateDefinition={id:'freeze',name:'Freeze',version:1,page,header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]}};
  return {model,template};
}

describe('Phase 4.8 PDF production freeze',()=>{
  it('keeps numeric table values single-line and renders repeated regions',async()=>{
    const {model,template}=fixture([table(80)]);
    const out=await new PdfRenderer().render(template,model);
    const pdf=new TextDecoder('latin1').decode(out.content);
    const pages=(pdf.match(/\/Type \/Page\b/g)||[]).length;
    expect(pages).toBeGreaterThan(1);
    expect((pdf.match(/HEADER/g)||[]).length).toBe(pages);
    expect(pdf).toContain('14839.02');
  });

  it('fails safely when the atomic post-table trailing section cannot fit on one page',async()=>{
    const {model,template}=fixture([table(1),{id:'oversize',type:'SPACER',height:400,layout:{...layout,keepTogether:true}}]);
    await expect(new PdfRenderer().render(template,model)).rejects.toThrow('TRAILING_BLOCK_EXCEEDS_PAGE');
  });

  it('emits non-sensitive production diagnostics through the optional callback',async()=>{
    const {model,template}=fixture([table(2)]);
    let diagnostics:any;
    await new PdfRenderer().render(template,model,{options:{onDiagnostics:(value:any)=>diagnostics=value}});
    expect(diagnostics.templateId).toBe('freeze');
    expect(diagnostics.documentGroupId).toBe('g-1');
    expect(diagnostics.pageCount).toBeGreaterThan(0);
    expect(diagnostics.renderDurationMs).toBeGreaterThanOrEqual(0);
  });
});
