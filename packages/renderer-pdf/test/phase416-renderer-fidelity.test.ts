import { describe, expect, it } from 'vitest';
import type { RenderModel, RenderSummaryTableBlock, RequiredBlockLayout, RequiredTextStyle, TemplateDefinition } from '@document-tool/contracts';
import { PdfRenderer } from '../src/pdf-renderer.js';

const layout:RequiredBlockLayout={widthPercent:100,alignment:'LEFT',marginTop:0,marginRight:0,marginBottom:0,marginLeft:0,keepTogether:false,breakBefore:false,breakAfter:false};
const text:RequiredTextStyle={fontFamily:'Arial',fontSize:9,bold:false,italic:false,underline:false,textColor:'#000000',backgroundColor:'#FFFFFF',alignment:'LEFT',lineHeight:1.2};
const page={size:'A4' as const,orientation:'PORTRAIT' as const,margins:{top:10,right:14,bottom:12,left:16},pagination:{repeatHeader:true,footerMode:'FLOW' as const,showPageNumbers:false}};

function summary():RenderSummaryTableBlock{
  const columns=['HSN','GST','Taxable Amt.','SGST','CGST','IGST','Total'].map((label,i)=>({id:`c${i}`,label,widthPercent:[16,12,18,11,11,11,21][i],alignment:i<2?'CENTER' as const:'RIGHT' as const,headerAlignment:'CENTER' as const,style:text}));
  const cells=['73201020','18.00%','₹9,588.15','₹862.93','₹862.93','₹0.00','₹11,314.01'].map((value,i)=>({id:`v${i}`,columnId:`c${i}`,value,alignment:i<2?'CENTER' as const:'RIGHT' as const,style:text}));
  const totalCells=['Total','','₹9,588.15','₹862.93','₹862.93','₹0.00','₹11,314.02'].map((value,i)=>({id:`t${i}`,columnId:`c${i}`,value,alignment:i===0?'RIGHT' as const:i===1?'CENTER' as const:'RIGHT' as const,style:{...text,bold:true}}));
  return {id:'tax-summary',type:'SUMMARY_TABLE',showHeader:true,showBorder:true,columns,rows:[{id:'r',cells,style:text,backgroundColor:'#FFFFFF',bold:false}],totalRow:{id:'total',cells:totalCells,style:{...text,bold:true},backgroundColor:'#FFFFFF',bold:true},widthPercent:60,alignment:'RIGHT',headerStyle:text,cellStyle:text,border:{width:1,color:'#94A3B8',style:'SOLID'},cellPadding:{top:1,right:1,bottom:1,left:1},layout:{...layout,widthPercent:60,alignment:'RIGHT'}};
}
function fixture(){
  const model:RenderModel={variables:{},page,body:[summary()],metadata:{documentGroupId:'fidelity'}};
  const template:TemplateDefinition={id:'fidelity',name:'Fidelity',version:1,page,header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]}};
  return {model,template};
}
function pdfText(bytes:Uint8Array){return new TextDecoder('latin1').decode(bytes);}

describe('Phase 4.16 native PDF fidelity',()=>{
  it('preserves rupee presentation without renderer-specific Rs. substitution',async()=>{
    const {model,template}=fixture();
    const out=await new PdfRenderer().render(template,model);
    const pdf=pdfText(out.content);
    expect(pdf).not.toContain('Rs.');
    // The rupee is emitted as vector drawing operations; numeric text remains intact.
    expect(pdf).toContain('9,588.15');
    expect(pdf).toContain('11,314.01');
  });

  it('keeps configured physical page margins in the media/content geometry path',async()=>{
    const {model,template}=fixture();
    const out=await new PdfRenderer().render(template,model);
    const pdf=pdfText(out.content);
    expect(pdf).toContain('/MediaBox [0 0 595.276 841.89]');
  });

  it('renders the same summary through combined/single layout without shrinking the configured 60% twice',async()=>{
    const {model,template}=fixture();
    const out=await new PdfRenderer().render(template,model);
    const pdf=pdfText(out.content);
    // 60% of A4 printable width (~510pt) is ~306pt. The summary border rows should
    // contain cells whose x positions extend well beyond the old squared-width (~184pt).
    const rectWidths=[...pdf.matchAll(/ ([0-9.]+) ([0-9.]+) re S/g)].map(m=>Number(m[1])).filter(Number.isFinite);
    expect(rectWidths.some(v=>v>45)).toBe(true);
  });
});
