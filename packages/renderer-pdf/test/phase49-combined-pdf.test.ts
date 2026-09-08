import { describe, expect, it } from 'vitest';
import type { RenderModel, RequiredBlockLayout, RequiredTextStyle, TemplateDefinition } from '@document-tool/contracts';
import { CombinedPdfError, CombinedPdfRenderer, PdfRenderer } from '../src/pdf-renderer.js';

const layout:RequiredBlockLayout={widthPercent:100,alignment:'LEFT',marginTop:0,marginRight:0,marginBottom:1,marginLeft:0,keepTogether:false,breakBefore:false,breakAfter:false};
const text:RequiredTextStyle={fontFamily:'Arial',fontSize:9,bold:false,italic:false,underline:false,textColor:'#000000',backgroundColor:'#FFFFFF',alignment:'LEFT',lineHeight:1.2};
const page={size:'A4' as const,orientation:'PORTRAIT' as const,margins:{top:12,right:12,bottom:12,left:12},pagination:{repeatHeader:true,repeatFooter:true,showPageNumbers:true,pageNumberPosition:'BOTTOM_CENTER' as const,footerMode:'REPEAT_PAGE' as const}};

function fixture(id:string,label:string,bodyRows=0,pageOverride=page){
  const body:RenderModel['body']=[{id:`body-${id}`,type:'TEXT',text:`BODY ${label}`,style:text,layout}];
  if(bodyRows>0){
    body.push({
      id:`table-${id}`,type:'TABLE',showHeader:true,showBorder:true,
      columns:[
        {id:'d',label:'Description',path:'d',widthPercent:70,alignment:'LEFT',headerAlignment:'LEFT',headerStyle:text,cellStyle:text},
        {id:'a',label:'Amount',path:'a',widthPercent:30,alignment:'RIGHT',headerAlignment:'RIGHT',headerStyle:text,cellStyle:text},
      ],
      rows:Array.from({length:bodyRows},(_,i)=>[`Item ${label} ${i+1}`,14839.02+i]),
      footerRows:[{id:'total',cells:[{id:'l',colspan:1,value:'Total',alignment:'RIGHT',style:{...text,bold:true}},{id:'v',colspan:1,value:'38922.31',alignment:'RIGHT',style:{...text,bold:true}}],style:text,backgroundColor:'#FFFFFF'}],
      empty:false,widthPercent:100,alignment:'LEFT',headerStyle:text,cellStyle:text,border:{width:1,color:'#CBD5E1',style:'SOLID'},cellPadding:{top:2,right:2,bottom:2,left:2},layout,
    });
  }
  const model:RenderModel={variables:{},page:pageOverride,header:[{id:`h-${id}`,type:'TEXT',text:`HEADER ${label}`,style:text,layout}],body,footer:[{id:`f-${id}`,type:'TEXT',text:`FOOTER ${label}`,style:text,layout}],metadata:{documentGroupId:id}};
  const template:TemplateDefinition={id:`template-${id}`,name:`Template ${label}`,version:1,page:pageOverride,header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]}};
  return {documentGroupId:id,label,template,model};
}

function pdfText(bytes:Uint8Array){return new TextDecoder('latin1').decode(bytes);}
function pageCount(bytes:Uint8Array){return (pdfText(bytes).match(/\/Type \/Page\b/g)||[]).length;}

describe('Phase 4.9 multi-invoice combined PDF',()=>{
  it('appends two independent one-page invoices without a blank separator page',async()=>{
    const renderer=new CombinedPdfRenderer();
    const result=await renderer.render([fixture('a','INV-A'),fixture('b','INV-B')],{pageNumbering:'PER_DOCUMENT',totalDocumentsHint:2});
    expect(result.documentCount).toBe(2);
    expect(result.totalPages).toBe(2);
    expect(pageCount(result.content)).toBe(2);
    expect(result.documents.map((d)=>[d.startPage,d.endPage])).toEqual([[1,1],[2,2]]);
    const pdf=pdfText(result.content);
    expect(pdf).toContain('HEADER INV-A');
    expect(pdf).toContain('HEADER INV-B');
    expect((pdf.match(/Page 1 of 1/g)||[]).length).toBe(2);
  });

  it('supports global numbering after all document-local page counts are known',async()=>{
    const result=await new CombinedPdfRenderer().render([fixture('a','INV-A'),fixture('b','INV-B')],{pageNumbering:'GLOBAL'});
    const pdf=pdfText(result.content);
    expect(pdf).toContain('Page 1 of 2');
    expect(pdf).toContain('Page 2 of 2');
  });

  it('preserves single-document page count when the same invoice is rendered through combined mode',async()=>{
    const source=fixture('long','LONG',85);
    const single=await new PdfRenderer().render(source.template,source.model);
    const combined=await new CombinedPdfRenderer().render([source],{pageNumbering:'PER_DOCUMENT'});
    expect(combined.totalPages).toBe(pageCount(single.content));
    expect(combined.documents[0]?.pageCount).toBe(pageCount(single.content));
    expect(combined.documents[0]?.startPage).toBe(1);
    expect(combined.documents[0]?.endPage).toBe(combined.totalPages);
  });

  it('deduplicates repeated group ids while preserving first occurrence order',async()=>{
    const a=fixture('a','FIRST');
    const duplicate={...fixture('a','SHOULD-NOT-RENDER')};
    const b=fixture('b','SECOND');
    const result=await new CombinedPdfRenderer().render([a,duplicate,b]);
    expect(result.documentCount).toBe(2);
    const pdf=pdfText(result.content);
    expect(pdf).toContain('FIRST');
    expect(pdf).not.toContain('SHOULD-NOT-RENDER');
    expect(pdf.indexOf('FIRST')).toBeLessThan(pdf.indexOf('SECOND'));
  });

  it('supports lazy document resolution so only the active invoice RenderModel is created',async()=>{
    const resolved:string[]=[];
    const a=fixture('a','A'),b=fixture('b','B');
    const result=await new CombinedPdfRenderer().render([
      {documentGroupId:'a',label:'A',resolve:async()=>{resolved.push('a');return {template:a.template,model:a.model};}},
      {documentGroupId:'b',label:'B',resolve:async()=>{resolved.push('b');return {template:b.template,model:b.model};}},
    ]);
    expect(result.documentCount).toBe(2);
    expect(resolved).toEqual(['a','b']);
  });

  it('fails fast with document context when one invoice cannot render safely',async()=>{
    const bad=fixture('bad','BAD',1);
    bad.model.body=[
      ...(bad.model.body??[]),
      {id:'tail-too-large',type:'SPACER',height:400,layout:{...layout,keepTogether:true}},
    ];
    try{
      await new CombinedPdfRenderer().render([fixture('ok','OK'),bad]);
      throw new Error('Expected combined renderer to fail');
    }catch(error){
      expect(error).toBeInstanceOf(CombinedPdfError);
      expect((error as CombinedPdfError).code).toBe('DOCUMENT_RENDER_FAILED');
      expect((error as CombinedPdfError).documentGroupId).toBe('bad');
      expect((error as Error).message).toContain('TRAILING_BLOCK_EXCEEDS_PAGE');
    }
  });

  it('cancels at a document boundary instead of finalizing a partial file',async()=>{
    let completed=0;
    const renderer=new CombinedPdfRenderer();
    await expect(renderer.render([fixture('a','A'),fixture('b','B')],{
      shouldCancel:()=>completed>=1,
      onDocumentComplete:()=>{completed++;},
    })).rejects.toMatchObject({code:'COMBINED_PDF_CANCELLED'});
  });

  it('allows mixed physical page sizes without resizing prior invoices',async()=>{
    const landscape={...page,orientation:'LANDSCAPE' as const};
    const result=await new CombinedPdfRenderer().render([fixture('portrait','PORTRAIT'),fixture('landscape','LANDSCAPE',0,landscape)]);
    const pdf=pdfText(result.content);
    const mediaBoxes=[...pdf.matchAll(/\/MediaBox \[0 0 ([0-9.]+) ([0-9.]+)\]/g)].map((match)=>`${match[1]}x${match[2]}`);
    expect(new Set(mediaBoxes).size).toBeGreaterThan(1);
  });

  it('rejects an empty selection',async()=>{
    await expect(new CombinedPdfRenderer().render([])).rejects.toMatchObject({code:'EMPTY_DOCUMENT_SELECTION'});
  });
});
