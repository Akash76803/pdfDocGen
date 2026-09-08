import { describe, expect, it } from 'vitest';
import type { RenderModel, TemplateDefinition } from '@document-tool/contracts';
import { PdfRenderer } from '../src/pdf-renderer.js';

const textStyle = { fontFamily:'Arial',fontSize:10,bold:false,italic:false,underline:false,textColor:'#000000',backgroundColor:'#FFFFFF',alignment:'LEFT',lineHeight:1.2 } as const;
const layout = { widthPercent:100,alignment:'LEFT',marginTop:0,marginRight:0,marginBottom:0,marginLeft:0,keepTogether:false,breakBefore:false,breakAfter:false } as const;
const baseCell = { heightMode:'AUTO',heightMm:0,minHeightMm:0,overflow:'EXPAND',backgroundColor:'#FFFFFF',border:{width:0,color:'#CBD5E1',style:'NONE'},borderRadiusMm:0,padding:{top:0,right:0,bottom:0,left:0},horizontalAlignment:'LEFT',verticalAlignment:'TOP',minHeight:0 } as const;

function textBlock(id:string,text:string){return {id,type:'TEXT',text,style:textStyle,layout} as const;}

describe('Phase 4.8 Engine PDF flow and row width semantics',()=>{
  it('keeps FIXED_MM QR-like cell compact and gives AUTO cell the remaining width',async()=>{
    const page={size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}} as const;
    const row={id:'bank-row',type:'ROW',gap:3,verticalAlignment:'TOP',layout,children:[],columns:[
      {id:'qr',widthPercent:50,style:{...baseCell,widthMode:'FIXED_MM',widthPercent:50,widthMm:30},children:[textBlock('q','QRBOX')]},
      {id:'bank',widthPercent:50,style:{...baseCell,widthMode:'AUTO',widthPercent:50,widthMm:0},children:[textBlock('b','BANK DETAILS')]},
    ]} as const;
    const model:RenderModel={variables:{},page,header:[],body:[row],footer:[],metadata:{}};
    const template:TemplateDefinition={id:'t',name:'Bank Layout',version:1,page,header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]}};
    const out=await new PdfRenderer().render(template,model);
    const pdf=new TextDecoder().decode(out.content);
    const q=/1 0 0 1 ([\d.]+) [\d.]+ Tm \(QRBOX\)/.exec(pdf);
    const b=/1 0 0 1 ([\d.]+) [\d.]+ Tm \(BANK DETAILS\)/.exec(pdf);
    expect(q).toBeTruthy(); expect(b).toBeTruthy();
    const qx=Number(q![1]), bx=Number(b![1]);
    // 30mm fixed QR cell + 3mm gap should put Bank Details near the QR, not at a legacy 50% page split.
    expect(bx-qx).toBeGreaterThan(80);
    expect(bx-qx).toBeLessThan(115);
  });
});
