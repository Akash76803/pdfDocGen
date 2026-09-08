import type {
  Alignment,
  GeneratedDocument,
  RenderBlock,
  RenderCustomGridCell,
  RenderCustomTableBlock,
  RenderModel,
  RenderRowBlock,
  RenderSummaryRow,
  RenderSummaryTableBlock,
  RenderTableBlock,
  RequiredCellPadding,
  RequiredTextStyle,
  TemplateDefinition,
  VerticalAlignment,
} from '@document-tool/contracts';
import type { LegacyDocumentRenderer, RenderOptions, PageCapacity, PaginationItem } from '@document-tool/renderer-sdk';
import { paginateStable, DEFAULT_PAGINATION_POLICY, PAGINATION_EPSILON_MM, PAGINATION_SAFETY_GAP_MM, layoutFlow, allocateLinearWidths, resolvePageGeometry, resolveBlockFrame, resolveFidelityColumnWidths, isFinancialDisplayValue, semanticColumnWeight } from '@document-tool/renderer-sdk';
import { resolvePaginationPolicy } from './pagination-policy.js';

const PT_PER_MM = 72 / 25.4;
const mm = (value: number) => value * PT_PER_MM;
const MIN_CELL_HEIGHT = mm(3.2);

export type DrawOp = string;
export type PdfPage = { width:number; height:number; ops:DrawOp[]; extGStates?:string };
type FontKey = 'F1'|'F2'|'F3'|'F4'|'F5'|'F6';
export type PdfImage = { name:string; bytes:Uint8Array; width:number; height:number };

type Ctx = {
  pages: PdfPage[];
  page: PdfPage;
  pageWidth:number;
  pageHeight:number;
  left:number;
  right:number;
  top:number;
  bottom:number;
  contentWidth:number;
  y:number;
  headerHeight:number;
  footerHeight:number;
  model:RenderModel;
  images:Map<string,PdfImage>;
};

export type CombinedPdfPageNumbering = 'PER_DOCUMENT' | 'GLOBAL';

export type CombinedPdfDocumentSource = { documentGroupId:string; label?:string } & (
  | { template:TemplateDefinition; model:RenderModel; resolve?:never }
  | { resolve:()=>Promise<{template:TemplateDefinition;model:RenderModel}>|{template:TemplateDefinition;model:RenderModel}; template?:never; model?:never }
);

export interface CombinedPdfProgress {
  phase:'PREPARING'|'RENDERING'|'FINALIZING';
  currentDocument:number;
  totalDocuments?:number;
  documentGroupId?:string;
  pagesGenerated:number;
  percent:number;
}

export interface CombinedPdfDocumentResult {
  documentGroupId:string;
  label?:string;
  startPage:number;
  endPage:number;
  pageCount:number;
  status:'SUCCESS';
  renderDurationMs:number;
  warnings:string[];
}

export interface CombinedPdfResult extends GeneratedDocument {
  documentCount:number;
  totalPages:number;
  documents:CombinedPdfDocumentResult[];
  warnings:string[];
}

export type CombinedPdfErrorCode =
  | 'EMPTY_DOCUMENT_SELECTION'
  | 'DOCUMENT_RENDER_FAILED'
  | 'COMBINED_PDF_CANCELLED'
  | 'COMBINED_PDF_FINALIZE_FAILED';

export class CombinedPdfError extends Error {
  constructor(public readonly code:CombinedPdfErrorCode,message:string,public readonly documentGroupId?:string,public readonly cause?:unknown){
    super(message);this.name='CombinedPdfError';
  }
}

export interface CombinedPdfOptions {
  fileNamePrefix?:string;
  pageNumbering?:CombinedPdfPageNumbering;
  totalDocumentsHint?:number;
  shouldCancel?:()=>boolean;
  onProgress?:(progress:CombinedPdfProgress)=>void;
  onDocumentComplete?:(result:CombinedPdfDocumentResult)=>void;
  onDiagnostics?:(diagnostics:{documentCount:number;pageCount:number;renderDurationMs:number;warningsCount:number})=>void;
}

type LaidOutPdfDocument = {
  pages:PdfPage[];
  images:PdfImage[];
  model:RenderModel;
  pageDef:NonNullable<RenderModel['page']>;
  renderDurationMs:number;
};

export class PdfRenderer implements LegacyDocumentRenderer {
  readonly format = 'PDF' as const;

  async render(template: TemplateDefinition, model: RenderModel, options?: RenderOptions): Promise<GeneratedDocument> {
    const startedAt=Date.now();
    const laidOut=await layoutPdfDocument(template,model);
    drawDocumentPageNumbers(laidOut.pages,laidOut.pageDef,1,laidOut.pages.length);
    const bytes=buildPdf(laidOut.pages,laidOut.images);
    const prefix=sanitizeFileName(options?.fileNamePrefix || template.name || 'document');
    const diagnostics={
      templateId:template.id,
      documentGroupId:String(model.metadata?.documentGroupId ?? model.metadata?.groupId ?? ''),
      pageCount:laidOut.pages.length,
      renderDurationMs:Date.now()-startedAt,
      warningsCount:0,
      fidelityVersion:'4.16',
    };
    const onDiagnostics=options?.options?.onDiagnostics;
    if(typeof onDiagnostics==='function') onDiagnostics(diagnostics);
    return {format:'PDF',content:bytes,fileName:`${prefix}.pdf`,mimeType:'application/pdf'};
  }
}

/**
 * Coordinates multiple independent RenderModels into one physical PDF without
 * concatenating their body blocks. Every source is laid out with the exact same
 * single-document renderer/pagination path, then its already-planned pages are
 * appended to the combined writer. This guarantees a fresh page boundary and
 * resets all document-local pagination/header/footer state for every invoice.
 */
export class CombinedPdfRenderer {
  async render(
    documents:Iterable<CombinedPdfDocumentSource>|AsyncIterable<CombinedPdfDocumentSource>,
    options:CombinedPdfOptions={}
  ):Promise<CombinedPdfResult>{
    const startedAt=Date.now();
    const pageNumbering=options.pageNumbering ?? 'PER_DOCUMENT';
    const allPages:PdfPage[]=[];
    const allImages:PdfImage[]=[];
    const results:CombinedPdfDocumentResult[]=[];
    const records:Array<{pages:PdfPage[];pageDef:NonNullable<RenderModel['page']>;result:CombinedPdfDocumentResult}>=[];
    const seen=new Set<string>();
    let current=0;
    const hint=Math.max(0,options.totalDocumentsHint ?? 0);
    options.onProgress?.({phase:'PREPARING',currentDocument:0,totalDocuments:hint||undefined,pagesGenerated:0,percent:0});

    try{
      if(options.shouldCancel?.()) throw new CombinedPdfError('COMBINED_PDF_CANCELLED','Combined PDF generation was cancelled.');
      for await(const source of documents as AsyncIterable<CombinedPdfDocumentSource>){
        if(options.shouldCancel?.()) throw new CombinedPdfError('COMBINED_PDF_CANCELLED','Combined PDF generation was cancelled.');
        if(!source?.documentGroupId || seen.has(source.documentGroupId)) continue;
        seen.add(source.documentGroupId);current++;
        const percentBefore=hint?Math.min(98,Math.round(((current-1)/hint)*100)):0;
        options.onProgress?.({phase:'RENDERING',currentDocument:current,totalDocuments:hint||undefined,documentGroupId:source.documentGroupId,pagesGenerated:allPages.length,percent:percentBefore});
        const docStarted=Date.now();
        let laidOut:LaidOutPdfDocument;
        try{
          const resolved='resolve' in source && typeof source.resolve==='function' ? await source.resolve() : {template:source.template,model:source.model};
          laidOut=await layoutPdfDocument(resolved.template,resolved.model);
        }catch(error){
          throw new CombinedPdfError('DOCUMENT_RENDER_FAILED',`Unable to render document ${source.label || source.documentGroupId}: ${error instanceof Error?error.message:String(error)}`,source.documentGroupId,error);
        }
        if(options.shouldCancel?.()) throw new CombinedPdfError('COMBINED_PDF_CANCELLED','Combined PDF generation was cancelled.',source.documentGroupId);

        // Namespace image resource names because every isolated document starts
        // image numbering at Im1. PDF resource names must be unique globally.
        const namespaced=namespacePdfImages(laidOut.pages,laidOut.images,`D${current}_`);
        const startPage=allPages.length+1;
        allPages.push(...namespaced.pages);
        allImages.push(...namespaced.images);
        const result:CombinedPdfDocumentResult={
          documentGroupId:source.documentGroupId,
          label:source.label,
          startPage,
          endPage:allPages.length,
          pageCount:namespaced.pages.length,
          status:'SUCCESS',
          renderDurationMs:Date.now()-docStarted,
          warnings:[],
        };
        results.push(result);records.push({pages:namespaced.pages,pageDef:laidOut.pageDef,result});
        options.onDocumentComplete?.(result);
        const percent=hint?Math.min(99,Math.round((current/hint)*100)):0;
        options.onProgress?.({phase:'RENDERING',currentDocument:current,totalDocuments:hint||undefined,documentGroupId:source.documentGroupId,pagesGenerated:allPages.length,percent});

        // Yield between documents so desktop UI can paint progress/cancel state.
        await Promise.resolve();
      }

      if(options.shouldCancel?.()) throw new CombinedPdfError('COMBINED_PDF_CANCELLED','Combined PDF generation was cancelled.');
      if(!results.length) throw new CombinedPdfError('EMPTY_DOCUMENT_SELECTION','Select at least one document.');
      options.onProgress?.({phase:'FINALIZING',currentDocument:results.length,totalDocuments:hint||results.length,pagesGenerated:allPages.length,percent:99});

      if(pageNumbering==='GLOBAL'){
        let globalPage=1;
        for(const record of records){
          for(const page of record.pages) drawPageNumber(page,record.pageDef,globalPage++,allPages.length);
        }
      }else{
        for(const record of records) drawDocumentPageNumbers(record.pages,record.pageDef,1,record.pages.length);
      }

      const bytes=buildPdf(allPages,allImages);
      const prefix=sanitizeFileName(options.fileNamePrefix || 'Combined_Documents');
      const diagnostics={documentCount:results.length,pageCount:allPages.length,renderDurationMs:Date.now()-startedAt,warningsCount:0,fidelityVersion:'4.16'};
      options.onDiagnostics?.(diagnostics);
      options.onProgress?.({phase:'FINALIZING',currentDocument:results.length,totalDocuments:hint||results.length,pagesGenerated:allPages.length,percent:100});
      return {format:'PDF',content:bytes,fileName:`${prefix}.pdf`,mimeType:'application/pdf',documentCount:results.length,totalPages:allPages.length,documents:results,warnings:[]};
    }catch(error){
      if(error instanceof CombinedPdfError) throw error;
      throw new CombinedPdfError('COMBINED_PDF_FINALIZE_FAILED',error instanceof Error?error.message:'Unable to finalize combined PDF.',undefined,error);
    }
  }
}

async function layoutPdfDocument(template:TemplateDefinition,model:RenderModel):Promise<LaidOutPdfDocument>{
  const startedAt=Date.now();
  const pageDef=model.page ?? template.page;
  const geometry=resolvePageGeometry(pageDef);
  const pageWidth=mm(geometry.widthMm),pageHeight=mm(geometry.heightMm);
  const left=mm(geometry.marginLeftMm),right=mm(geometry.marginRightMm),top=mm(geometry.marginTopMm),bottom=mm(geometry.marginBottomMm);
  const contentWidth=Math.max(10,mm(geometry.contentWidthMm));
  const images=await prepareImages(model);
  const firstPage=makePage(pageWidth,pageHeight,pageDef);
  const ctx:Ctx={pages:[firstPage],page:firstPage,pageWidth,pageHeight,left,right,top,bottom,contentWidth,y:pageHeight-top,headerHeight:0,footerHeight:0,model:{...model,page:pageDef},images};
  ctx.headerHeight=measureBlocks(model.header ?? [],contentWidth,images);
  ctx.footerHeight=measureBlocks(model.footer ?? [],contentWidth,images);
  drawRepeatedRegions(ctx);ctx.y=pageHeight-top-headerSpace(ctx);
  const body=model.body ?? [];
  const trailingStart=findTrailingSectionStart(body);
  for(let index=0;index<body.length;index++){
    if(index===trailingStart) reserveTrailingSection(ctx,body.slice(trailingStart),contentWidth);
    renderFlowBlock(ctx,body[index]!,left,contentWidth);
  }
  const footerMode=resolvePaginationPolicy(pageDef.pagination).footerMode;
  if(footerMode!=='REPEAT_PAGE'){
    if(footerMode==='LAST_PAGE_ONLY' && ctx.footerHeight>0) ensureSpace(ctx,ctx.footerHeight);
    for(const block of model.footer ?? []) renderFlowBlock(ctx,block,left,contentWidth);
  }
  return {pages:ctx.pages,images:[...images.values()],model,pageDef,renderDurationMs:Date.now()-startedAt};
}

function makePage(width:number,height:number,pageDef:NonNullable<RenderModel['page']>):PdfPage {
  const ops:string[]=[];
  const bg = pageDef.backgroundColor ?? '#FFFFFF';
  if (bg.toUpperCase() !== '#FFFFFF') {
    const [r,g,b]=rgb(bg); ops.push(`${r} ${g} ${b} rg 0 0 ${f(width)} ${f(height)} re f`);
  }
  if (pageDef.border?.enabled && pageDef.border.style !== 'NONE') {
    const o=mm(pageDef.border.offset ?? 4); const [r,g,b]=rgb(pageDef.border.color ?? '#111827');
    ops.push(`${r} ${g} ${b} RG ${f(pageDef.border.width ?? 1)} w${pageDef.border.style==='DASHED'?' [4 3] 0 d':''} ${f(o)} ${f(o)} ${f(width-2*o)} ${f(height-2*o)} re S [] 0 d`);
  }
  return {width,height,ops};
}

function newPage(ctx:Ctx){
  const p=makePage(ctx.pageWidth,ctx.pageHeight,ctx.model.page!);ctx.pages.push(p);ctx.page=p;drawRepeatedRegions(ctx);ctx.y=ctx.pageHeight-ctx.top-headerSpace(ctx);
}
function headerSpace(ctx:Ctx){const p=resolvePaginationPolicy(ctx.model.page?.pagination);return (ctx.pages.length===1 || p.repeatHeader) ? ctx.headerHeight : 0;}
function footerSpace(ctx:Ctx){return resolvePaginationPolicy(ctx.model.page?.pagination).footerMode==='REPEAT_PAGE' ? ctx.footerHeight : 0;}
function bodyBottom(ctx:Ctx){return ctx.bottom+footerSpace(ctx);}
function ensureSpace(ctx:Ctx,height:number){ if(ctx.y-height<bodyBottom(ctx)) newPage(ctx); }

function drawRepeatedRegions(ctx:Ctx){
  const firstPage = ctx.pages.length===1;
  if(firstPage || resolvePaginationPolicy(ctx.model.page?.pagination).repeatHeader){
    let y=ctx.pageHeight-ctx.top;
    for(const b of ctx.model.header ?? []) y=drawFixedBlock(ctx,b,ctx.left,y,ctx.contentWidth);
  }
  if(resolvePaginationPolicy(ctx.model.page?.pagination).footerMode==='REPEAT_PAGE'){
    let fy=ctx.bottom+ctx.footerHeight;
    for(const b of ctx.model.footer ?? []) fy=drawFixedBlock(ctx,b,ctx.left,fy,ctx.contentWidth);
  }
}

function drawDocumentPageNumbers(pages:PdfPage[],pageDef:NonNullable<RenderModel['page']>,startPage:number,total:number){
  pages.forEach((page,index)=>drawPageNumber(page,pageDef,startPage+index,total));
}
function drawPageNumber(page:PdfPage,pageDef:NonNullable<RenderModel['page']>,current:number,total:number){
  const settings=pageDef.pagination;
  if(!resolvePaginationPolicy(settings).showPageNumbers) return;
  const pos=settings?.pageNumberPosition ?? 'BOTTOM_CENTER';
  const margins=pageDef.margins;
  const left=mm(margins.left),right=mm(margins.right),bottom=mm(margins.bottom);
  const text=`Page ${current} of ${total}`,size=8;
  const y=Math.max(4,bottom*0.35),width=measuredTextWidth(text,size,'F1');
  const x=pos==='BOTTOM_LEFT'?left:pos==='BOTTOM_RIGHT'?page.width-right-width:(page.width-width)/2;
  drawText(page,text,size,x,y,'#64748B','LEFT','F1');
}
function namespacePdfImages(pages:PdfPage[],images:PdfImage[],prefix:string):{pages:PdfPage[];images:PdfImage[]}{
  if(!images.length) return {pages,images};
  const rename=new Map(images.map((image)=>[image.name,`${prefix}${image.name}`]));
  const escaped=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  for(const page of pages){
    page.ops=page.ops.map((op)=>{
      let next=op;
      for(const [from,to] of rename) next=next.replace(new RegExp(`/${escaped(from)}\\s+Do`,'g'),`/${to} Do`);
      return next;
    });
  }
  return {pages,images:images.map((image)=>({...image,name:rename.get(image.name)!}))};
}

function findTrailingSectionStart(body:RenderBlock[]):number {
  // Invoice/report trailing content is the flow after the final paginated data table.
  // Keep it atomic only when the policy requests ATOMIC and the tail contains content.
  let lastTable=-1;
  for(let i=0;i<body.length;i++) if(body[i]?.type==='TABLE') lastTable=i;
  return lastTable>=0 && lastTable<body.length-1 ? lastTable+1 : -1;
}

function fullBodyCapacity(ctx:Ctx):number {
  return Math.max(0,ctx.pageHeight-ctx.top-headerSpace(ctx)-bodyBottom(ctx)-mm(PAGINATION_SAFETY_GAP_MM));
}

function reserveTrailingSection(ctx:Ctx,blocks:RenderBlock[],maxWidth:number){
  if(!blocks.length || DEFAULT_PAGINATION_POLICY.trailingBlockMode!=='ATOMIC') return;
  const total=blocks.reduce((sum,b)=>{
    const width=maxWidth*(b.layout.widthPercent/100);
    return sum+mm(b.layout.marginTop)+measureBlock(b,width,ctx.images)+mm(b.layout.marginBottom);
  },0);
  const full=fullBodyCapacity(ctx);
  if(total>full+mm(PAGINATION_EPSILON_MM)){
    if(!DEFAULT_PAGINATION_POLICY.emergencySplitEnabled) throw new Error('TRAILING_BLOCK_EXCEEDS_PAGE');
    return;
  }
  const remaining=Math.max(0,ctx.y-bodyBottom(ctx)-mm(PAGINATION_SAFETY_GAP_MM));
  if(total>remaining+mm(PAGINATION_EPSILON_MM) && ctx.y < ctx.pageHeight-ctx.top-headerSpace(ctx)-mm(PAGINATION_EPSILON_MM)) newPage(ctx);
}

function renderFlowBlock(ctx:Ctx,block:RenderBlock,x:number,maxWidth:number){
  if(block.layout.breakBefore && ctx.y < ctx.pageHeight-ctx.top-headerSpace(ctx)-1) newPage(ctx);
  const mt=mm(block.layout.marginTop), mb=mm(block.layout.marginBottom);
  const frame=resolveBlockFrame(maxWidth,block.layout.widthPercent,block.layout.alignment,mm(block.layout.marginLeft),mm(block.layout.marginRight),mt,mb);
  const w=frame.width;
  const bx=x+frame.x;
  if(block.type==='TABLE'){ renderDataTable(ctx,block,bx,w,mt,mb); if(block.layout.breakAfter) newPage(ctx); return; }
  const h=measureBlock(block,w,ctx.images);
  ensureSpace(ctx,mt+h+mb);ctx.y-=mt;ctx.y=drawBlock(ctx,block,bx,ctx.y,w);ctx.y-=mb;
  if(block.layout.breakAfter) newPage(ctx);
}

function drawFixedBlock(ctx:Ctx,block:RenderBlock,x:number,y:number,maxWidth:number){
  // Header/footer blocks use the same layout contract as body blocks. Previously
  // their margins were measured but ignored while drawing, which shifted content
  // and made Engine PDF page padding differ from Live Preview / Exact print.
  const mt=mm(block.layout.marginTop),mb=mm(block.layout.marginBottom);
  const frame=resolveBlockFrame(maxWidth,block.layout.widthPercent,block.layout.alignment,mm(block.layout.marginLeft),mm(block.layout.marginRight),mt,mb);
  return drawBlockAt(ctx,block,x+frame.x,y-mt,frame.width)-mb;
}
function drawBlock(ctx:Ctx,block:RenderBlock,x:number,y:number,w:number){return drawBlockAt(ctx,block,x,y,w);}

function drawBlockAt(ctx:Ctx,block:RenderBlock,x:number,y:number,w:number):number {
  switch(block.type){
    case 'TEXT': return drawTextBlock(ctx,block.text,block.style,x,y,w);
    case 'FIELD': {
      if(block.layoutMode==='STACKED'){
        let yy=y;if(block.label) yy=drawTextBlock(ctx,block.label,block.labelStyle,x,yy,w);yy-=mm(block.spacing);return drawTextBlock(ctx,block.value,block.valueStyle,x,yy,w);
      }
      // Keep label/value runs on the same baseline when they fit; otherwise wrap safely as one field line.
      const label = block.label ? `${block.label}: ` : '';
      const labelW = measuredTextWidth(label,block.labelStyle.fontSize,fontFor(block.labelStyle));
      const valueW = measuredTextWidth(block.value,block.valueStyle.fontSize,fontFor(block.valueStyle));
      const totalW = labelW + valueW;
      if(label && totalW <= w){
        const startX = block.textAlignment==='CENTER' ? x+(w-totalW)/2 : block.textAlignment==='RIGHT' ? x+w-totalW : x;
        const baseline=y-Math.max(block.labelStyle.fontSize,block.valueStyle.fontSize);
        drawText(ctx.page,label,block.labelStyle.fontSize,startX,baseline,block.labelStyle.textColor,'LEFT',fontFor(block.labelStyle));
        drawText(ctx.page,block.value,block.valueStyle.fontSize,startX+labelW,baseline,block.valueStyle.textColor,'LEFT',fontFor(block.valueStyle));
        return y-Math.max(block.labelStyle.fontSize*block.labelStyle.lineHeight,block.valueStyle.fontSize*block.valueStyle.lineHeight);
      }
      return drawTextBlock(ctx,`${label}${block.value}`,{...block.valueStyle,alignment:block.textAlignment},x,y,w);
    }
    case 'DIVIDER': { const yy=y-mm(1); const [r,g,b]=rgb(block.color); ctx.page.ops.push(`${r} ${g} ${b} RG ${f(block.thickness)} w${block.style==='DASHED'?' [4 3] 0 d':''} ${f(x)} ${f(yy)} m ${f(x+w)} ${f(yy)} l S [] 0 d`); return y-mm(2); }
    case 'SPACER': return y-mm(block.height);
    case 'IMAGE': return drawImageBlock(ctx,block.source,block.altText||'Image',block.width,block.height,block.maintainAspectRatio,block.alignment,x,y,w);
    case 'BOX': return drawBox(ctx,block,x,y,w);
    case 'ROW': return drawRow(ctx,block,x,y,w);
    case 'SUMMARY_TABLE': return drawSummary(ctx,block,x,y,w);
    case 'CUSTOM_TABLE': return drawCustom(ctx,block,x,y,w);
    case 'TABLE': return drawTableNonPaginated(ctx,block,x,y,w);
  }
}

function drawTextBlock(ctx:Ctx,text:string,style:RequiredTextStyle,x:number,y:number,w:number){
  const innerPad = style.backgroundColor && style.backgroundColor.toUpperCase()!=='#FFFFFF' ? mm(1.2) : 0;
  const lines=wrap(String(text??''),Math.max(2,w-innerPad*2),style.fontSize,fontFor(style));
  const lh=style.fontSize*style.lineHeight;
  const textH=Math.max(lh,lines.length*lh);
  const h=textH+innerPad*2;
  if(style.backgroundColor && style.backgroundColor.toUpperCase()!=='#FFFFFF') rect(ctx.page,x,y-h,w,h,style.backgroundColor,undefined,0);
  let yy=y-innerPad-style.fontSize;
  for(const line of lines){drawText(ctx.page,line,style.fontSize,x+innerPad,yy,style.textColor,style.alignment,fontFor(style),Math.max(1,w-innerPad*2));yy-=lh;}
  return y-h;
}

function drawImageBlock(ctx:Ctx,source:string,altText:string,widthMm:number,heightMm:number|undefined,maintainAspect:boolean,alignment:Alignment,x:number,y:number,w:number){
  const asset=ctx.images.get(source);
  const iw=Math.min(w,mm(widthMm));
  let ih=heightMm?mm(heightMm):mm(Math.max(8,widthMm*.45));
  if(asset && maintainAspect && !heightMm) ih=iw*(asset.height/asset.width);
  if(asset && maintainAspect && heightMm){
    const natural=asset.width/asset.height; const requested=iw/ih;
    if(requested>natural) { const newW=ih*natural; return drawPdfImage(ctx.page,asset,alignX(x,w,newW,alignment),y-ih,newW,ih), y-ih; }
    ih=iw/natural;
  }
  const ix=alignX(x,w,iw,alignment);
  if(asset){ drawPdfImage(ctx.page,asset,ix,y-ih,iw,ih); }
  else { rect(ctx.page,ix,y-ih,iw,ih,'#F8FAFC','#94A3B8',0.5); drawText(ctx.page,altText,8,ix+3,y-ih/2,'#64748B','LEFT','F1',Math.max(1,iw-6)); }
  return y-ih;
}

function drawBox(ctx:Ctx,b:Extract<RenderBlock,{type:'BOX'}>,x:number,y:number,w:number){
  const s=b.style; const bw=s.widthMode==='FIXED_MM'&&s.widthMm>0?Math.min(w,mm(s.widthMm)):w;
  const padL=mm(s.padding.left),padR=mm(s.padding.right),padT=mm(s.padding.top),padB=mm(s.padding.bottom);
  const innerW=Math.max(2,bw-padL-padR); const nestedChildren=b.children.map(child=>normalizeNestedPdfBlock(child as RenderBlock)); const natural=measureBlocks(nestedChildren,innerW,ctx.images)+padT+padB;
  let h=s.heightMode==='FIXED'&&s.heightMm>0?mm(s.heightMm):Math.max(natural,mm(s.minHeightMm));
  const bx=alignX(x,w,bw,s.horizontalAlignment==='CENTER'?'CENTER':b.style.horizontalAlignment==='RIGHT'?'RIGHT':'LEFT');
  cellBox(ctx.page,bx,y-h,bw,h,s.border.style!=='NONE',s.backgroundColor,s.border);
  const contentH=Math.max(0,natural-padT-padB); let cy=verticalContentTop(y,h,contentH,s.verticalAlignment,padT,padB);
  for(const rawChild of b.children){const child=normalizeNestedPdfBlock(rawChild as RenderBlock);const ch=measureBlock(child,innerW,ctx.images)+mm((child.layout.marginTop??0)+(child.layout.marginBottom??0)); if(s.heightMode==='FIXED'&&s.overflow==='CLIP'&&cy-ch<y-h+padB) break; cy-=mm(child.layout.marginTop??0); cy=drawBlockAt(ctx,child,bx+padL,cy,innerW); cy-=mm(child.layout.marginBottom??0);}
  return y-h;
}

function renderDataTable(ctx:Ctx,t:RenderTableBlock,x:number,w:number,mt:number,mb:number){
  ctx.y-=mt;
  const widths=tableColumnWidths(t,w);
  const headerH=t.showHeader?measureTableHeader(t,widths):0;
  const footerHeights=t.footerRows.map(fr=>measureFooterRow(fr,t,widths));
  const tableFooterHeight=footerHeights.reduce((a,b)=>a+b,0);
  const rowHeights=t.rows.map(row=>measureTableRow(row,t,widths));
  const safetyGap=mm(PAGINATION_SAFETY_GAP_MM);
  const epsilon=mm(PAGINATION_EPSILON_MM);

  // If the first row cannot safely fit in the current page's remainder, move the
  // table to a fresh page BEFORE drawing its header. This avoids a header orphan.
  if(t.rows.length){
    const firstFollowup=t.rows.length===1 ? tableFooterHeight+mb : 0;
    const firstRequired=headerH+rowHeights[0]!+firstFollowup+safetyGap;
    const currentRemaining=ctx.y-bodyBottom(ctx);
    if(firstRequired>currentRemaining+epsilon && ctx.y < ctx.pageHeight-ctx.top-headerSpace(ctx)-epsilon) newPage(ctx);
  }

  const fullBodyHeight=Math.max(0,ctx.pageHeight-ctx.top-headerSpace(ctx)-bodyBottom(ctx));
  const firstBodyHeight=Math.max(0,ctx.y-bodyBottom(ctx));
  const firstRowsCapacity=Math.max(0,firstBodyHeight-headerH);
  const continuationRowsCapacity=Math.max(0,fullBodyHeight-headerH);

  type TablePayload={ kind:'ROW'; index:number }|{ kind:'FOOTER'; index:number };
  const items:PaginationItem<TablePayload>[]=[];
  rowHeights.forEach((height,index)=>{
    const isLast=index===rowHeights.length-1;
    items.push({
      id:`${t.id}:row:${index}`,
      kind:'TABLE_ROW',
      height,
      keepWithNextHeight:isLast ? tableFooterHeight+mb : 0,
      payload:{kind:'ROW',index},
    });
  });
  footerHeights.forEach((height,index)=>items.push({
    id:`${t.id}:footer:${index}`,
    kind:'TABLE_FOOTER',
    height,
    keepTogether:true,
    payload:{kind:'FOOTER',index},
  }));

  const capacity=(height:number):PageCapacity=>({
    pageHeight:height,topMargin:0,bottomMargin:0,repeatedHeaderHeight:0,repeatedFooterHeight:0,safetyGap,usableBodyHeight:height,
  });
  const plan=paginateStable(items,{
    policy:{...DEFAULT_PAGINATION_POLICY,safetyGapMm:safetyGap,epsilonMm:epsilon},
    capacityResolver:(pageIndex)=>capacity(pageIndex===0?firstRowsCapacity:continuationRowsCapacity),
  });

  const drawHead=()=>{ if(t.showHeader) ctx.y=drawTableHeader(ctx,t,x,ctx.y,w,widths,headerH); };
  plan.forEach((planned,pageIndex)=>{
    if(pageIndex>0) newPage(ctx);
    drawHead();
    for(const item of planned.items){
      if(item.payload?.kind==='ROW'){
        const i=item.payload.index; ctx.y=drawTableRow(ctx,t,t.rows[i]!,x,ctx.y,widths,rowHeights[i]!);
      }else if(item.payload?.kind==='FOOTER'){
        const i=item.payload.index; ctx.y=drawFooterRow(ctx,t,t.footerRows[i]!,x,ctx.y,widths,footerHeights[i]!);
      }
      // Development guard: body content must never enter the reserved footer zone.
      if(ctx.y < bodyBottom(ctx)-epsilon) throw new Error(`PAGINATION_OVERFLOW:${t.id}:${item.id}`);
    }
  });
  ctx.y-=mb;
}

function drawTableNonPaginated(ctx:Ctx,t:RenderTableBlock,x:number,y:number,w:number){
  const widths=tableColumnWidths(t,w);let yy=y;
  if(t.showHeader){const h=measureTableHeader(t,widths);yy=drawTableHeader(ctx,t,x,yy,w,widths,h);}
  for(const row of t.rows){const h=measureTableRow(row,t,widths);yy=drawTableRow(ctx,t,row,x,yy,widths,h);}
  for(const fr of t.footerRows){const h=measureFooterRow(fr,t,widths);yy=drawFooterRow(ctx,t,fr,x,yy,widths,h);}
  return yy;
}
function drawTableHeader(ctx:Ctx,t:RenderTableBlock,x:number,y:number,_w:number,widths:number[],h:number){
  let yy=y;
  if((t.headerGroups?.length ?? 0)>0){
    const gh=measureTableGroupHeader(t,widths);let xx=x;let i=0;const byStart=new Map((t.headerGroups ?? []).map(g=>[g.startColumnId,g]));
    while(i<t.columns.length){const c=t.columns[i]!;const group=byStart.get(c.id);const span=group?Math.min(group.colspan,t.columns.length-i):1;const cw=widths.slice(i,i+span).reduce((a,b)=>a+b,0);cellBox(ctx.page,xx,yy-gh,cw,gh,t.showBorder,group?.style.backgroundColor ?? t.headerStyle.backgroundColor,t.border);if(group)drawCellText(ctx.page,group.label,group.style,xx,yy,cw,gh,t.cellPadding,group.alignment,'CENTER');xx+=cw;i+=span;}yy-=gh;
  }
  const leafH=h-((t.headerGroups?.length ?? 0)?measureTableGroupHeader(t,widths):0);let xx=x;t.columns.forEach((c,i)=>{cellBox(ctx.page,xx,yy-leafH,widths[i]!,leafH,t.showBorder,t.headerStyle.backgroundColor,t.border);drawCellText(ctx.page,c.label,c.headerStyle,xx,yy,widths[i]!,leafH,t.cellPadding,c.headerAlignment,'CENTER');xx+=widths[i]!;});return yy-leafH;
}
function drawTableRow(ctx:Ctx,t:RenderTableBlock,row:Array<string|number|boolean|null>,x:number,y:number,widths:number[],h:number){
  let xx=x;row.forEach((v,i)=>{const c=t.columns[i]!;cellBox(ctx.page,xx,y-h,widths[i]!,h,t.showBorder,c.cellStyle.backgroundColor,t.border);const value=String(v??'');if((c.kind==='IMAGE'||c.kind==='QR')&&value){const asset=ctx.images.get(value);const innerW=Math.max(1,widths[i]!-mm(t.cellPadding.left+t.cellPadding.right));const iw=Math.min(innerW,mm(c.imageWidthMm ?? 18));let ih=Math.min(h-mm(t.cellPadding.top+t.cellPadding.bottom),mm(c.imageHeightMm ?? c.imageWidthMm ?? 18));if(asset&&c.kind==='IMAGE'&&asset.width>0)ih=Math.min(ih,iw*(asset.height/asset.width));const ix=alignX(xx+mm(t.cellPadding.left),innerW,iw,c.alignment);const iy=y-mm(t.cellPadding.top)-ih;if(asset)drawPdfImage(ctx.page,asset,ix,iy,iw,ih);else if(c.kind==='QR'&&value.startsWith('data:image/svg+xml'))drawQrSvgVector(ctx.page,value,ix,iy,iw,ih);else drawText(ctx.page,c.kind==='QR'?'QR':'Image',7,ix,iy+ih/2,'#64748B','LEFT','F1',iw);}else if(isNumericPdfValue(value))drawCellTextNoWrap(ctx.page,value,c.cellStyle,xx,y,widths[i]!,h,t.cellPadding,c.alignment,'CENTER');else drawCellText(ctx.page,value,c.cellStyle,xx,y,widths[i]!,h,t.cellPadding,c.alignment,'CENTER');xx+=widths[i]!;});return y-h;
}
function drawFooterRow(ctx:Ctx,t:RenderTableBlock,row:RenderTableBlock['footerRows'][number],x:number,y:number,widths:number[],h:number){
  let col=0;for(const cell of row.cells){const target=cell.columnId?Math.max(col,t.columns.findIndex(c=>c.id===cell.columnId)):col;if(target>col){const gap=widths.slice(col,target).reduce((a,b)=>a+b,0);const gx=x+widths.slice(0,col).reduce((a,b)=>a+b,0);cellBox(ctx.page,gx,y-h,gap,h,t.showBorder,row.backgroundColor,t.border);col=target;}const span=Math.min(Math.max(1,cell.colspan),Math.max(1,widths.length-col));const cw=widths.slice(col,col+span).reduce((a,b)=>a+b,0)||widths[col]||0;const xx=x+widths.slice(0,col).reduce((a,b)=>a+b,0);cellBox(ctx.page,xx,y-h,cw,h,t.showBorder,row.backgroundColor,t.border);const value=String(cell.value??'');if(isNumericPdfValue(value))drawCellTextNoWrap(ctx.page,value,cell.style,xx,y,cw,h,t.cellPadding,cell.alignment,'CENTER');else drawCellText(ctx.page,value,cell.style,xx,y,cw,h,t.cellPadding,cell.alignment,'CENTER');col+=span;}if(col<widths.length){const gx=x+widths.slice(0,col).reduce((a,b)=>a+b,0);cellBox(ctx.page,gx,y-h,widths.slice(col).reduce((a,b)=>a+b,0),h,t.showBorder,row.backgroundColor,t.border);}return y-h;
}
function measureTableHeader(t:RenderTableBlock,widths:number[]){
  let max=MIN_CELL_HEIGHT;
  t.columns.forEach((c,i)=>{const available=Math.max(3,widths[i]!-mm(t.cellPadding.left+t.cellPadding.right));const lines=wrap(c.label,available,t.headerStyle.fontSize,fontFor(t.headerStyle));max=Math.max(max,lines.length*t.headerStyle.fontSize*t.headerStyle.lineHeight+mm(t.cellPadding.top+t.cellPadding.bottom));});
  return max+((t.headerGroups?.length ?? 0)?measureTableGroupHeader(t,widths):0);
}
function measureTableGroupHeader(t:RenderTableBlock,widths:number[]){let max=MIN_CELL_HEIGHT;const byStart=new Map((t.headerGroups ?? []).map(g=>[g.startColumnId,g]));for(let i=0;i<t.columns.length;){const g=byStart.get(t.columns[i]!.id);const span=g?Math.min(g.colspan,t.columns.length-i):1;if(g){const cw=widths.slice(i,i+span).reduce((a,b)=>a+b,0);const available=Math.max(3,cw-mm(t.cellPadding.left+t.cellPadding.right));const lines=wrap(g.label,available,g.style.fontSize,fontFor(g.style));max=Math.max(max,lines.length*g.style.fontSize*g.style.lineHeight+mm(t.cellPadding.top+t.cellPadding.bottom));}i+=span;}return max;}

function measureTableRow(row:Array<unknown>,t:RenderTableBlock,widths:number[]){
  let max=MIN_CELL_HEIGHT;row.forEach((v,i)=>{const c=t.columns[i]!;if((c.kind==='IMAGE'||c.kind==='QR')&&v){max=Math.max(max,mm((c.imageHeightMm ?? c.imageWidthMm ?? 18)+t.cellPadding.top+t.cellPadding.bottom));return;}const available=Math.max(3,widths[i]!-mm(t.cellPadding.left+t.cellPadding.right));const value=String(v??'');const lines=isNumericPdfValue(value)?[value]:wrap(value,available,c.cellStyle.fontSize,fontFor(c.cellStyle));max=Math.max(max,lines.length*c.cellStyle.fontSize*c.cellStyle.lineHeight+mm(t.cellPadding.top+t.cellPadding.bottom));});return max;
}
function measureFooterRow(row:RenderTableBlock['footerRows'][number],t:RenderTableBlock,widths:number[]){
  let max=MIN_CELL_HEIGHT;let col=0;for(const cell of row.cells){const target=cell.columnId?Math.max(col,t.columns.findIndex(c=>c.id===cell.columnId)):col;col=Math.max(col,target);const span=Math.min(Math.max(1,cell.colspan),Math.max(1,widths.length-col));const cw=widths.slice(col,col+span).reduce((a,b)=>a+b,0)||widths[col]||0;const available=Math.max(3,cw-mm(t.cellPadding.left+t.cellPadding.right));const value=String(cell.value??'');const lines=isNumericPdfValue(value)?[value]:wrap(value,available,cell.style.fontSize,fontFor(cell.style));max=Math.max(max,lines.length*cell.style.fontSize*cell.style.lineHeight+mm(t.cellPadding.top+t.cellPadding.bottom));col+=span;}return max;
}

function drawSummary(ctx:Ctx,t:RenderSummaryTableBlock,x:number,y:number,w:number){
  // renderFlowBlock has already resolved tableStyle/layout widthPercent and alignment.
  // Applying t.widthPercent again here squared the requested width (for example
  // 40% became 16%), causing tax/amount summaries to shrink-wrap in Engine PDF.
  const tw=w;const tx=x;const widths=summaryColumnWidths(t,tw);let yy=y;
  if(t.title)yy=drawTextBlock(ctx,t.title,{...t.headerStyle,alignment:'LEFT'},tx,yy,tw);
  if(t.showHeader){const h=measureSummaryHeader(t,widths);let xx=tx;t.columns.forEach((c,i)=>{cellBox(ctx.page,xx,yy-h,widths[i]!,h,t.showBorder,t.headerStyle.backgroundColor,t.border);drawCellText(ctx.page,c.label,c.style,xx,yy,widths[i]!,h,t.cellPadding,c.headerAlignment,'CENTER');xx+=widths[i]!;});yy-=h;}
  const rows=t.totalRow?[...t.rows,t.totalRow]:t.rows;
  for(const row of rows){const h=measureSummaryRow(row,t,widths);let xx=tx;t.columns.forEach((c,i)=>{const cell=row.cells.find(v=>v.columnId===c.id);cellBox(ctx.page,xx,yy-h,widths[i]!,h,t.showBorder,row.backgroundColor||t.cellStyle.backgroundColor,t.border);if(cell){const value=String(cell.value??'');if(isNumericPdfValue(value))drawCellTextNoWrap(ctx.page,value,cell.style,xx,yy,widths[i]!,h,t.cellPadding,cell.alignment,'CENTER');else drawCellText(ctx.page,value,cell.style,xx,yy,widths[i]!,h,t.cellPadding,cell.alignment,'CENTER');}xx+=widths[i]!;});yy-=h;}
  return yy;
}
function measureSummaryHeader(t:RenderSummaryTableBlock,widths:number[]){
  let h=MIN_CELL_HEIGHT;t.columns.forEach((c,i)=>{const lines=wrap(c.label,Math.max(3,widths[i]!-mm(t.cellPadding.left+t.cellPadding.right)),c.style.fontSize,fontFor(c.style));h=Math.max(h,lines.length*c.style.fontSize*c.style.lineHeight+mm(t.cellPadding.top+t.cellPadding.bottom));});return h;
}
function measureSummaryRow(row:RenderSummaryRow,t:RenderSummaryTableBlock,widths:number[]){
  let h=MIN_CELL_HEIGHT;t.columns.forEach((c,i)=>{const cell=row.cells.find(v=>v.columnId===c.id);if(!cell)return;const value=String(cell.value??'');const available=Math.max(3,widths[i]!-mm(t.cellPadding.left+t.cellPadding.right));const lines=isNumericPdfValue(value)?[value]:wrap(value,available,cell.style.fontSize,fontFor(cell.style));h=Math.max(h,lines.length*cell.style.fontSize*cell.style.lineHeight+mm(t.cellPadding.top+t.cellPadding.bottom));});return h;
}

function drawCustom(ctx:Ctx,t:RenderCustomTableBlock,x:number,y:number,w:number){
  const only=t.rowCount===1&&t.columnCount===1?t.cells[0]:undefined; const tw=only?.style.widthMode==='FIXED_MM'&&only.style.widthMm>0?Math.min(w,mm(only.style.widthMm)):w;const tx=alignX(x,w,tw,t.alignment);const colW=tw/t.columnCount;
  const rowHeights=computeCustomRowHeights(t,colW,ctx.images);const rowTop:number[]=[];let cursor=y;for(let r=0;r<t.rowCount;r++){rowTop[r]=cursor;cursor-=rowHeights[r]!;}
  for(const cell of t.cells){
    const cx=tx+cell.column*colW;const cw=cell.colSpan*colW;const top=rowTop[cell.row]??y;const ch=rowHeights.slice(cell.row,cell.row+cell.rowSpan).reduce((a,b)=>a+b,0);const cy=top-ch;
    const border=cell.style.border.style==='NONE'?t.border:cell.style.border; cellBox(ctx.page,cx,cy,cw,ch,t.showBorder&&border.style!=='NONE',cell.style.backgroundColor,border);
    drawCustomCellContent(ctx,cell,cx,top,cw,ch,t.cellPadding);
  }
  return cursor;
}

function computeCustomRowHeights(t:RenderCustomTableBlock,colW:number,images:Map<string,PdfImage>){
  const heights=Array.from({length:t.rowCount},()=>MIN_CELL_HEIGHT);
  for(const cell of t.cells.filter(c=>c.rowSpan===1)){
    const contentH=measureCustomCellContent(cell,cell.colSpan*colW,t.cellPadding,images);
    const desired=cell.style.heightMode==='FIXED'&&cell.style.heightMm>0?mm(cell.style.heightMm):Math.max(contentH,mm(Math.max(cell.style.minHeight,cell.style.minHeightMm))); heights[cell.row]=Math.max(heights[cell.row]!,desired);
  }
  // If a row contains only blank cells and no explicit min-height, keep it compact rather than reserving 10mm.
  for(let r=0;r<t.rowCount;r++){
    const rowCells=t.cells.filter(c=>c.row===r && c.rowSpan===1);
    if(rowCells.length && rowCells.every(c=>c.content.type==='BLANK' && c.style.minHeight<=0)) heights[r]=mm(2.2);
  }
  for(const cell of t.cells.filter(c=>c.rowSpan>1)){
    const measured=measureCustomCellContent(cell,cell.colSpan*colW,t.cellPadding,images); const required=cell.style.heightMode==='FIXED'&&cell.style.heightMm>0?mm(cell.style.heightMm):Math.max(measured,mm(Math.max(cell.style.minHeight,cell.style.minHeightMm)));
    const end=Math.min(t.rowCount,cell.row+cell.rowSpan);
    const current=heights.slice(cell.row,end).reduce((a,b)=>a+b,0);
    if(required>current){
      // Deterministic rowspan propagation: preserve earlier row measurements and let
      // the final covered row absorb the remainder. This avoids proportionally
      // inflating unrelated rows and gives pagination a stable merged-cell boundary.
      const lastCovered=Math.max(cell.row,end-1);
      heights[lastCovered]! += required-current;
    }
  }
  return heights;
}
function measureCustomCellContent(cell:RenderCustomGridCell,w:number,pad:RequiredCellPadding,images:Map<string,PdfImage>){
  const inner=Math.max(3,w-mm(pad.left+pad.right));
  if(cell.content.type==='BLANK') return mm(pad.top+pad.bottom)+MIN_CELL_HEIGHT;
  if(cell.content.type==='IMAGE'){
    const asset=cell.content.source?images.get(cell.content.source):undefined;const iw=Math.min(inner,mm(cell.content.width??25));let ih=cell.content.height?mm(cell.content.height):mm(Math.max(8,(cell.content.width??25)*.45));if(asset && cell.content.maintainAspectRatio!==false && !cell.content.height)ih=iw*(asset.height/asset.width);return ih+mm(pad.top+pad.bottom);
  }
  const value=String(cell.content.value??'');
  if(isNumericPdfValue(value)) return cell.content.style.fontSize*cell.content.style.lineHeight+mm(pad.top+pad.bottom);
  return textHeight(value,cell.content.style,inner)+mm(pad.top+pad.bottom);
}
function drawCustomCellContent(ctx:Ctx,cell:RenderCustomGridCell,x:number,top:number,w:number,h:number,pad:RequiredCellPadding){
  const innerX=x+mm(pad.left), innerW=Math.max(2,w-mm(pad.left+pad.right));
  if(cell.content.type==='BLANK')return;
  if(cell.content.type==='IMAGE'){
    const asset=cell.content.source?ctx.images.get(cell.content.source):undefined;const iw=Math.min(innerW,mm(cell.content.width??25));let ih=cell.content.height?mm(cell.content.height):mm(Math.max(8,(cell.content.width??25)*.45));if(asset&&cell.content.maintainAspectRatio!==false&&!cell.content.height)ih=iw*(asset.height/asset.width);const ix=alignX(innerX,innerW,iw,cell.style.horizontalAlignment);const iy=verticalContentTop(top,h,ih,cell.style.verticalAlignment,mm(pad.top),mm(pad.bottom));if(asset)drawPdfImage(ctx.page,asset,ix,iy-ih,iw,ih);else drawText(ctx.page,cell.content.altText||'Image',8,ix,iy-ih/2,'#64748B','LEFT','F1',iw);return;
  }
  const style=cell.content.style;const text=String(cell.content.value??'');
  // Numeric cells must never degrade into character-per-line output. Shrink to fit
  // within a safe floor; textual cells wrap on word boundaries and grow the row.
  if(isNumericPdfValue(text)){
    let size=style.fontSize;
    while(size>6 && measuredTextWidth(text,size,fontFor(style))>innerW) size-=0.5;
    const textH=size*style.lineHeight;
    const yy=verticalContentTop(top,h,textH,cell.style.verticalAlignment,mm(pad.top),mm(pad.bottom))-size;
    drawText(ctx.page,text,size,innerX,yy,style.textColor,cell.style.horizontalAlignment,fontFor(style),innerW);return;
  }
  const lines=wrap(text,innerW,style.fontSize,fontFor(style));const textH=Math.max(style.fontSize*style.lineHeight,lines.length*style.fontSize*style.lineHeight);let yy=verticalContentTop(top,h,textH,cell.style.verticalAlignment,mm(pad.top),mm(pad.bottom))-style.fontSize;for(const line of lines){drawText(ctx.page,line,style.fontSize,innerX,yy,style.textColor,cell.style.horizontalAlignment,fontFor(style),innerW);yy-=style.fontSize*style.lineHeight;}
}

function normalizeNestedPdfBlock(block: RenderBlock): RenderBlock {
  if (block.type === 'TABLE' || block.type === 'SUMMARY_TABLE' || block.type === 'CUSTOM_TABLE') {
    return {
      ...block,
      widthPercent: 100,
      alignment: 'LEFT',
      layout: { ...block.layout, widthPercent: 100, alignment: 'LEFT', marginLeft: 0, marginRight: 0 },
    } as RenderBlock;
  }
  return {
    ...block,
    layout: { ...block.layout, widthPercent: 100, alignment: 'LEFT', marginLeft: 0, marginRight: 0 },
  } as RenderBlock;
}

function isNumericPdfValue(value: unknown): boolean { return isFinancialDisplayValue(value); }


function tableColumnWidths(t:RenderTableBlock,total:number){
  const pad=mm(t.cellPadding.left+t.cellPadding.right);
  const specs=t.columns.map((column,index)=>{
    let minWidth=0;
    const header=String(column.label??'');
    const headerParts=header.split(/\s+/).filter(Boolean);
    const longestHeader=headerParts.reduce((a,b)=>measuredTextWidth(a,column.headerStyle.fontSize,fontFor(column.headerStyle))>=measuredTextWidth(b,column.headerStyle.fontSize,fontFor(column.headerStyle))?a:b,'');
    if(longestHeader) minWidth=Math.max(minWidth,measuredTextWidth(longestHeader,column.headerStyle.fontSize,fontFor(column.headerStyle))+pad);
    for(const row of t.rows){
      const value=String(row[index]??'');
      if(isFinancialDisplayValue(value)) minWidth=Math.max(minWidth,measuredTextWidth(value,column.cellStyle.fontSize,fontFor(column.cellStyle))+pad);
    }
    for(const footer of t.footerRows){
      for(const cell of footer.cells){
        if(cell.columnId!==column.id) continue;
        const value=String(cell.value??'');
        if(isFinancialDisplayValue(value)) minWidth=Math.max(minWidth,measuredTextWidth(value,cell.style.fontSize,fontFor(cell.style))+pad);
      }
    }
    return {widthPercent:column.widthPercent,minWidth:Math.min(total,minWidth),preferredWidth:Math.min(total,minWidth),weight:semanticColumnWeight(header,column.alignment)};
  });
  return resolveFidelityColumnWidths(specs,total);
}

function summaryColumnWidths(t:RenderSummaryTableBlock,total:number){
  const pad=mm(t.cellPadding.left+t.cellPadding.right);
  const rows=t.totalRow?[...t.rows,t.totalRow]:t.rows;
  const specs=t.columns.map(column=>{
    const header=String(column.label??'');
    const parts=header.split(/\s+/).filter(Boolean);
    const longestHeader=parts.reduce((a,b)=>measuredTextWidth(a,column.style.fontSize,fontFor(column.style))>=measuredTextWidth(b,column.style.fontSize,fontFor(column.style))?a:b,'');
    let minWidth=longestHeader?measuredTextWidth(longestHeader,column.style.fontSize,fontFor(column.style))+pad:0;
    for(const row of rows){
      const cell=row.cells.find(v=>v.columnId===column.id); if(!cell) continue;
      const value=String(cell.value??'');
      if(isFinancialDisplayValue(value)) minWidth=Math.max(minWidth,measuredTextWidth(value,cell.style.fontSize,fontFor(cell.style))+pad);
    }
    return {widthPercent:column.widthPercent,minWidth:Math.min(total,minWidth),preferredWidth:Math.min(total,minWidth),weight:semanticColumnWeight(header,column.alignment)};
  });
  return resolveFidelityColumnWidths(specs,total);
}

function rowColumnWidths(row:RenderRowBlock,w:number){
  const cols=row.columns.length?row.columns:[];
  const gap=mm(row.gap);
  const available=Math.max(0,w-gap*Math.max(0,cols.length-1));
  if(!cols.length) return {gap, widths:[] as number[]};
  const specs=cols.map(c=>{
    const mode=c.style.widthMode;
    if(mode==='FIXED_MM') return {mode:'FIXED' as const,fixed:mm(c.style.widthMm)};
    if(mode==='PERCENT') return {mode:'PERCENT' as const,percent:c.style.widthPercent || c.widthPercent};
    return {mode:'AUTO' as const};
  });
  return {gap,widths:allocateLinearWidths(specs,available)};
}

function drawRow(ctx:Ctx,row:RenderRowBlock,x:number,y:number,w:number){
  const cols=row.columns.length?row.columns.map(c=>({widthPercent:c.widthPercent,children:c.children,style:c.style})):row.children.map(c=>({widthPercent:c.layout.widthPercent,children:[c],style:undefined}));if(!cols.length)return y;
  const resolved=row.columns.length?rowColumnWidths(row,w):{gap:mm(row.gap),widths:columnWidths(cols.map(c=>c.widthPercent),w-mm(row.gap)*(cols.length-1))};
  const gap=resolved.gap;const widths=resolved.widths;
  const contentHeights=cols.map((c,i)=>measureBlocks(c.children.map((child:any)=>normalizeNestedPdfBlock(child as RenderBlock)),Math.max(2,widths[i]!-mm((c.style?.padding.left??0)+(c.style?.padding.right??0))),ctx.images));
  const heights=cols.map((c,i)=>Math.max(contentHeights[i]!+mm((c.style?.padding.top??0)+(c.style?.padding.bottom??0)),mm(c.style?.minHeight??0)));
  const h=Math.max(...heights,0);let xx=x;
  cols.forEach((c,i)=>{
    const cw=widths[i]!;const padL=mm(c.style?.padding.left??0),padR=mm(c.style?.padding.right??0),padT=mm(c.style?.padding.top??0),padB=mm(c.style?.padding.bottom??0);
    if(c.style)cellBox(ctx.page,xx,y-h,cw,h,c.style.border.style!=='NONE',c.style.backgroundColor,c.style.border);
    const contentH=contentHeights[i]!;const valign=c.style?.verticalAlignment??row.verticalAlignment;let cy=verticalContentTop(y,h,contentH,valign,padT,padB);
    for(const child of c.children)cy=drawBlockAt(ctx,normalizeNestedPdfBlock(child as RenderBlock),xx+padL,cy,Math.max(2,cw-padL-padR));
    xx+=cw+gap;
  });
  return y-h;
}

function measureBlocks(blocks:RenderBlock[]|any[],w:number,images:Map<string,PdfImage>){
  const items=blocks.map((b:any)=>({id:b.id,height:measureBlock(b,w,images),marginTop:mm(b.layout?.marginTop??0),marginBottom:mm(b.layout?.marginBottom??0)}));
  const positions=layoutFlow(items,0,0);
  if(!positions.length)return 0;
  const last=positions[positions.length-1]!;
  return last.bottom + (items[items.length-1]?.marginBottom ?? 0);
}
function measureBlock(b:RenderBlock,w:number,images:Map<string,PdfImage>):number{
  switch(b.type){
    case'TEXT':return textBlockHeight(b.text,b.style,w);
    case'FIELD':return b.layoutMode==='STACKED'?textBlockHeight(b.label??'',b.labelStyle,w)+mm(b.spacing)+textBlockHeight(b.value,b.valueStyle,w):textBlockHeight(b.label?`${b.label}: ${b.value}`:b.value,b.valueStyle,w);
    case'SPACER':return mm(b.height);
    case'DIVIDER':return mm(2);
    case'IMAGE':{const asset=images.get(b.source);const iw=Math.min(w,mm(b.width));if(asset&&b.maintainAspectRatio&&!b.height)return iw*(asset.height/asset.width);return mm(b.height??Math.max(8,b.width*.45));}
    case'TABLE':{const widths=tableColumnWidths(b,w);return (b.showHeader?measureTableHeader(b,widths):0)+b.rows.reduce((s,r)=>s+measureTableRow(r,b,widths),0)+b.footerRows.reduce((s,r)=>s+measureFooterRow(r,b,widths),0);}
    case'SUMMARY_TABLE':{const tw=w;const widths=summaryColumnWidths(b,tw);return (b.showHeader?measureSummaryHeader(b,widths):0)+b.rows.reduce((s,r)=>s+measureSummaryRow(r,b,widths),0)+(b.totalRow?measureSummaryRow(b.totalRow,b,widths):0)+(b.title?textBlockHeight(b.title,b.headerStyle,tw):0);}
    case'CUSTOM_TABLE':{const only=b.rowCount===1&&b.columnCount===1?b.cells[0]:undefined;const tw=only?.style.widthMode==='FIXED_MM'&&only.style.widthMm>0?Math.min(w,mm(only.style.widthMm)):w;return computeCustomRowHeights(b,tw/b.columnCount,images).reduce((a,v)=>a+v,0);}
    case'BOX':{const s=b.style;const bw=s.widthMode==='FIXED_MM'&&s.widthMm>0?Math.min(w,mm(s.widthMm)):w;const inner=Math.max(2,bw-mm(s.padding.left+s.padding.right));const natural=measureBlocks(b.children.map(child=>normalizeNestedPdfBlock(child as RenderBlock)),inner,images)+mm(s.padding.top+s.padding.bottom);return s.heightMode==='FIXED'&&s.heightMm>0?mm(s.heightMm):Math.max(natural,mm(s.minHeightMm));}
    case'ROW':{const cols=b.columns.length?b.columns:b.children.map(c=>({widthPercent:c.layout.widthPercent,children:[c]} as any));const resolved=b.columns.length?rowColumnWidths(b,w):{gap:mm(b.gap),widths:columnWidths(cols.map((c:any)=>c.widthPercent),w-mm(b.gap)*Math.max(0,cols.length-1))};const widths=resolved.widths;return Math.max(0,...cols.map((c:any,i:number)=>measureBlocks(c.children.map((child:any)=>normalizeNestedPdfBlock(child as RenderBlock)),Math.max(2,widths[i]!-mm((c.style?.padding?.left??0)+(c.style?.padding?.right??0))),images)+mm((c.style?.padding?.top??0)+(c.style?.padding?.bottom??0))));}
  }
}
function textBlockHeight(text:string,style:RequiredTextStyle,w:number){const pad=style.backgroundColor&&style.backgroundColor.toUpperCase()!=='#FFFFFF'?mm(2.4):0;return textHeight(text,style,Math.max(2,w-(pad?mm(2.4):0)))+pad;}
function textHeight(text:string,style:RequiredTextStyle,w:number){const lines=wrap(String(text??''),w,style.fontSize,fontFor(style));return Math.max(style.fontSize*style.lineHeight,lines.length*style.fontSize*style.lineHeight);}

function drawCellText(page:PdfPage,text:string,style:RequiredTextStyle,x:number,y:number,w:number,h:number,pad:{top:number;right:number;bottom:number;left:number},align:Alignment,vertical:VerticalAlignment='TOP'){
  const px=mm(pad.left),pr=mm(pad.right),pt=mm(pad.top),pb=mm(pad.bottom);const innerW=Math.max(2,w-px-pr);const lines=wrap(text,innerW,style.fontSize,fontFor(style));const textH=Math.max(style.fontSize*style.lineHeight,lines.length*style.fontSize*style.lineHeight);let yy=verticalContentTop(y,h,textH,vertical,pt,pb)-style.fontSize;for(const line of lines){drawText(page,line,style.fontSize,x+px,yy,style.textColor,align,fontFor(style),innerW);yy-=style.fontSize*style.lineHeight;}
}
function drawCellTextNoWrap(page:PdfPage,text:string,style:RequiredTextStyle,x:number,y:number,w:number,h:number,pad:{top:number;right:number;bottom:number;left:number},align:Alignment,vertical:VerticalAlignment='TOP'){
  const px=mm(pad.left),pr=mm(pad.right),pt=mm(pad.top),pb=mm(pad.bottom);
  const innerW=Math.max(2,w-px-pr);
  const natural=measuredTextWidth(text,style.fontSize,fontFor(style));
  const fittedSize=natural<=innerW?style.fontSize:Math.max(5,style.fontSize*(innerW/Math.max(1,natural)));
  const textH=fittedSize*style.lineHeight;
  const yy=verticalContentTop(y,h,textH,vertical,pt,pb)-fittedSize;
  drawText(page,text,fittedSize,x+px,yy,style.textColor,align,fontFor(style),innerW);
}

function verticalContentTop(top:number,h:number,contentH:number,align:VerticalAlignment,padTop:number,padBottom:number){const available=Math.max(0,h-padTop-padBottom);if(align==='CENTER')return top-padTop-Math.max(0,(available-contentH)/2);if(align==='BOTTOM')return top-h+padBottom+contentH;return top-padTop;}
function cellBox(page:PdfPage,x:number,y:number,w:number,h:number,border:boolean,bg:string,b:{width:number;color:string;style:string}){if(bg&&bg.toUpperCase()!=='#FFFFFF')rect(page,x,y,w,h,bg,undefined,0);if(border){const [r,g,bb]=rgb(b.color);page.ops.push(`${r} ${g} ${bb} RG ${f(b.width)} w${b.style==='DASHED'?' [4 3] 0 d':''} ${f(x)} ${f(y)} ${f(w)} ${f(h)} re S [] 0 d`);}}
function rect(page:PdfPage,x:number,y:number,w:number,h:number,fill?:string,stroke?:string,sw=1){const ops:string[]=[];if(fill){const [r,g,b]=rgb(fill);ops.push(`${r} ${g} ${b} rg`);}if(stroke){const [r,g,b]=rgb(stroke);ops.push(`${r} ${g} ${b} RG ${f(sw)} w`);}ops.push(`${f(x)} ${f(y)} ${f(w)} ${f(h)} re ${fill&&stroke?'B':fill?'f':'S'}`);page.ops.push(ops.join(' '));}
function drawText(page:PdfPage,text:string,size:number,x:number,y:number,color:string,align:Alignment,font:FontKey,maxWidth=0){
  const normalized=normalizePdfText(text);
  const approx=measuredTextWidth(normalized,size,font);
  let xx=x;if(maxWidth){if(align==='CENTER')xx=x+(maxWidth-approx)/2;else if(align==='RIGHT')xx=x+maxWidth-approx;}
  const [r,g,b]=rgb(color);
  const parts=normalized.split(/(₹)/g).filter(Boolean);
  for(const part of parts){
    if(part==='₹'){
      drawRupeeGlyph(page,xx,y,size,color);
      xx+=rupeeGlyphWidth(size);
      continue;
    }
    const safe=escapePdf(part);
    if(safe) page.ops.push(`BT /${font} ${f(size)} Tf ${r} ${g} ${b} rg 1 0 0 1 ${f(xx)} ${f(y)} Tm (${safe}) Tj ET`);
    xx+=measuredTextWidth(part,size,font);
  }
}
function rupeeGlyphWidth(size:number){return size*.62;}
function drawRupeeGlyph(page:PdfPage,x:number,baseline:number,size:number,color:string){
  // Dependency-free vector fallback for the Indian Rupee glyph. Core PDF Type1
  // fonts do not contain U+20B9; drawing the glyph keeps the shared display
  // string (₹) intact instead of renderer-specific "Rs." substitution.
  const [r,g,b]=rgb(color);const w=rupeeGlyphWidth(size);const top=baseline+size*.72;const upper=baseline+size*.53;const mid=baseline+size*.37;const bottom=baseline-size*.04;const left=x+size*.04;const right=x+w-size*.04;const stem=x+size*.23;
  page.ops.push(`${r} ${g} ${b} RG ${f(Math.max(.55,size*.065))} w ${f(left)} ${f(top)} m ${f(right)} ${f(top)} l S ${f(left)} ${f(upper)} m ${f(right-size*.08)} ${f(upper)} l S ${f(stem)} ${f(top)} m ${f(stem)} ${f(mid)} l ${f(right-size*.02)} ${f(bottom)} l S ${f(left)} ${f(mid)} m ${f(right-size*.08)} ${f(mid)} l S`);
}
function drawQrSvgVector(page:PdfPage,source:string,x:number,y:number,w:number,h:number){
  try{const comma=source.indexOf(',');if(comma<0)return;const svg=decodeURIComponent(source.slice(comma+1));const vb=svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);if(!vb)return;const sw=Number(vb[1]),sh=Number(vb[2]);if(!sw||!sh)return;const sx=w/sw,sy=h/sh;const rect=/<rect x="([0-9.]+)" y="([0-9.]+)" width="1" height="1" fill="#000"\/>/g;let m:RegExpExecArray|null;const ops:string[]=['0 0 0 rg'];while((m=rect.exec(svg))){const rx=x+Number(m[1])*sx;const ry=y+h-(Number(m[2])+1)*sy;ops.push(`${f(rx)} ${f(ry)} ${f(sx)} ${f(sy)} re f`);}page.ops.push(ops.join(' '));}catch{/* malformed QR source: leave cell blank rather than corrupting the PDF */}
}

function drawPdfImage(page:PdfPage,image:PdfImage,x:number,y:number,w:number,h:number){page.ops.push(`q ${f(w)} 0 0 ${f(h)} ${f(x)} ${f(y)} cm /${image.name} Do Q`);}
function fontFor(style:RequiredTextStyle):FontKey{const times=style.fontFamily==='Times New Roman'||style.fontFamily==='serif';const courier=style.fontFamily==='Courier New'||style.fontFamily==='monospace';if(courier)return style.bold?'F6':'F5';if(times)return style.bold?'F4':'F3';return style.bold?'F2':'F1';}
function columnWidths(spec:Array<number|undefined>,total:number){const explicit:number=spec.reduce<number>((sum,v)=>sum+(v??0),0);const auto=spec.filter(v=>v==null).length;const autoPct=auto?Math.max(0,(100-explicit)/auto):0;const widths=spec.map(v=>total*((v??autoPct)/100));if(auto===0 && explicit>0 && explicit<99.999){const scale=total/widths.reduce((a,b)=>a+b,0);return widths.map(v=>v*scale);}return widths;}
function alignX(x:number,space:number,w:number,a:Alignment){return a==='CENTER'?x+(space-w)/2:a==='RIGHT'?x+space-w:x;}
function wrap(text:string,width:number,size:number,fontKey:FontKey='F1'){
  const out:string[]=[];for(const para of normalizePdfText(text).replace(/\r/g,'').split('\n')){if(!para){out.push('');continue;}let line='';for(const word of para.split(/\s+/)){if(!line){if(measuredTextWidth(word,size,fontKey)<=width){line=word;continue;}const chunks=splitWord(word,width,size,fontKey);out.push(...chunks.slice(0,-1));line=chunks.at(-1)??'';continue;}const candidate=`${line} ${word}`;if(measuredTextWidth(candidate,size,fontKey)<=width)line=candidate;else{out.push(line);if(measuredTextWidth(word,size,fontKey)<=width)line=word;else{const chunks=splitWord(word,width,size,fontKey);out.push(...chunks.slice(0,-1));line=chunks.at(-1)??'';}}}if(line)out.push(line);}return out.length?out:[''];
}
function splitWord(word:string,width:number,size:number,fontKey:FontKey='F1'){const chunks:string[]=[];let current='';for(const ch of word){if(current && measuredTextWidth(current+ch,size,fontKey)>width){chunks.push(current);current=ch;}else current+=ch;}if(current)chunks.push(current);return chunks.length?chunks:[''];}
// --- Real Adobe Core-14 AFM glyph widths (units per 1000 em), ASCII 32-126. ---
// These are the same metrics PDF viewers use for Helvetica/Times/Courier, so
// measurement here now matches what actually gets drawn instead of a guess.
const AFM_HELVETICA=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const AFM_HELVETICA_BOLD=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const AFM_TIMES=[250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541];
const AFM_TIMES_BOLD=[250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520];
// Courier (regular & bold) is fixed-pitch: every glyph is exactly 600/1000 em.
function widthTableFor(fontKey:FontKey):number[]|null{
  switch(fontKey){
    case 'F1': return AFM_HELVETICA;
    case 'F2': return AFM_HELVETICA_BOLD;
    case 'F3': return AFM_TIMES;
    case 'F4': return AFM_TIMES_BOLD;
    case 'F5': case 'F6': return null; // Courier: constant width, no table needed
  }
}
function glyphWidthUnits(code:number,table:number[]|null):number{
  if(table===null) return 600; // Courier fixed pitch
  if(code>=32 && code<=126) return table[code-32]!;
  return 556; // non-ASCII / extended char fallback (close to Helvetica's average)
}
function measuredTextWidth(text:string,size:number,fontKey:FontKey='F1'){
  const table=widthTableFor(fontKey);
  let units=0;
  for(const ch of normalizePdfText(text)){ if(ch==='₹'){units+=620;continue;} units+=glyphWidthUnits(ch.charCodeAt(0),table);}
  return (units/1000)*size;
}
function rgb(hex:string){const s=(hex||'#000000').replace('#','');const v=s.length===3?s.split('').map(c=>c+c).join(''):s.padEnd(6,'0').slice(0,6);return [parseInt(v.slice(0,2),16)/255,parseInt(v.slice(2,4),16)/255,parseInt(v.slice(4,6),16)/255].map(f).map(Number) as [number,number,number];}
function f(n:number){return Number.isFinite(n)?Number(n.toFixed(3)).toString():'0';}
function normalizePdfText(s:string){return String(s).replace(/[–—−]/g,'-').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/…/g,'...');}
function escapePdf(s:string){return normalizePdfText(s).replace(/₹/g,'').replace(/[^\x20-\x7E]/g,'?').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function sanitizeFileName(s:string){return s.replace(/[\\/:*?"<>|]+/g,'_').trim()||'document';}

async function prepareImages(model:RenderModel){
  const sources=new Set<string>();
  const walk=(blocks:RenderBlock[])=>{for(const block of blocks){if(block.type==='IMAGE'&&block.sourceType==='DATA_URL'&&block.source)sources.add(block.source);if(block.type==='ROW'){for(const c of block.columns)walk(c.children as RenderBlock[]);walk(block.children as RenderBlock[]);}if(block.type==='BOX')walk(block.children as RenderBlock[]);if(block.type==='CUSTOM_TABLE'){for(const c of block.cells)if(c.content.type==='IMAGE'&&c.content.sourceType==='DATA_URL'&&c.content.source)sources.add(c.content.source);}if(block.type==='TABLE'){block.rows.forEach(row=>row.forEach((cell,index)=>{const column=block.columns[index];if((column?.kind==='IMAGE'||column?.kind==='QR')&&typeof cell==='string'&&cell.startsWith('data:image/'))sources.add(cell);}));}}};
  walk(model.header??[]);walk(model.body??[]);walk(model.footer??[]);
  const map=new Map<string,PdfImage>();let index=1;
  for(const source of sources){const prepared=await prepareImage(source,index);if(prepared){map.set(source,prepared);index++;}}
  return map;
}
async function prepareImage(source:string,index:number):Promise<PdfImage|undefined>{
  try{
    if(/^data:image\/jpeg;base64,/i.test(source)||/^data:image\/jpg;base64,/i.test(source)){const bytes=decodeDataUrl(source);const dims=jpegDimensions(bytes);if(dims)return{name:`Im${index}`,bytes,width:dims.width,height:dims.height};}
    // Browser-side raster normalization: PNG/WEBP/etc -> JPEG, keeping renderer dependency-free.
    if(typeof fetch==='function' && typeof createImageBitmap==='function'){
      const blob=await (await fetch(source)).blob();const bitmap=await createImageBitmap(blob);let dataUrl='';
      if(typeof OffscreenCanvas!=='undefined'){
        const canvas=new OffscreenCanvas(bitmap.width,bitmap.height);const g=canvas.getContext('2d');if(!g)return;g.drawImage(bitmap,0,0);const jpg=await canvas.convertToBlob({type:'image/jpeg',quality:.94});dataUrl=await blobToDataUrl(jpg);
      }else if(typeof document!=='undefined'){
        const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const g=canvas.getContext('2d');if(!g)return;g.drawImage(bitmap,0,0);dataUrl=canvas.toDataURL('image/jpeg',.94);
      }
      bitmap.close?.();if(dataUrl){const bytes=decodeDataUrl(dataUrl);return{name:`Im${index}`,bytes,width:bitmap.width,height:bitmap.height};}
    }
  }catch{return undefined;}
  return undefined;
}
function decodeDataUrl(source:string){const base64=source.slice(source.indexOf(',')+1);if(typeof atob==='function'){const raw=atob(base64);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;}const B=(globalThis as any).Buffer;if(B)return new Uint8Array(B.from(base64,'base64'));return new Uint8Array();}
function jpegDimensions(bytes:Uint8Array){if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return;let i=2;while(i+8<bytes.length){if(bytes[i]!==0xff){i++;continue;}const marker=bytes[i+1]!;const len=(bytes[i+2]!<<8)+bytes[i+3]!;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){return{height:(bytes[i+5]!<<8)+bytes[i+6]!,width:(bytes[i+7]!<<8)+bytes[i+8]!};}i+=2+Math.max(0,len);}return;}
async function blobToDataUrl(blob:Blob){return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error);reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(blob);});}

export function buildPdf(pages:PdfPage[],images:PdfImage[]):Uint8Array{
  const objects:Array<string|Uint8Array>=[];
  const add=(s:string|Uint8Array)=>{objects.push(s);return objects.length;};
  const catalog=add(''); const pagesObj=add('');
  const fonts:{[k:string]:number}={F1:add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),F2:add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'),F3:add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>'),F4:add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>'),F5:add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'),F6:add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>')};
  const imageIds=new Map<string,number>();
  for(const img of images){const header=`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`;const tail='\nendstream';const hb=new TextEncoder().encode(header),tb=new TextEncoder().encode(tail);const combined=new Uint8Array(hb.length+img.bytes.length+tb.length);combined.set(hb);combined.set(img.bytes,hb.length);combined.set(tb,hb.length+img.bytes.length);imageIds.set(img.name,add(combined));}
  const pageIds:number[]=[];
  for(const p of pages){const stream=p.ops.join('\n');const content=add(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`);const fontDict=Object.entries(fonts).map(([k,id])=>`/${k} ${id} 0 R`).join(' ');const xObjects=images.length?`/XObject << ${images.map(img=>`/${img.name} ${imageIds.get(img.name)} 0 R`).join(' ')} >>`:'';const gs=p.extGStates?`/ExtGState << ${p.extGStates} >>`:'';pageIds.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${f(p.width)} ${f(p.height)}] /Resources << /Font << ${fontDict} >> ${xObjects} ${gs} >> /Contents ${content} 0 R >>`));}
  objects[catalog-1]=`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;objects[pagesObj-1]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const chunks:Uint8Array[]=[new TextEncoder().encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];const offsets=[0];let length=chunks[0]!.length;
  for(let i=0;i<objects.length;i++){offsets.push(length);const prefix=new TextEncoder().encode(`${i+1} 0 obj\n`),suffix=new TextEncoder().encode('\nendobj\n');const body=typeof objects[i]==='string'?new TextEncoder().encode(objects[i] as string):objects[i] as Uint8Array;chunks.push(prefix,body,suffix);length+=prefix.length+body.length+suffix.length;}
  const xref=length;let trailer=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)trailer+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;trailer+=`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;const tr=new TextEncoder().encode(trailer);chunks.push(tr);length+=tr.length;const out=new Uint8Array(length);let pos=0;for(const c of chunks){out.set(c,pos);pos+=c.length;}return out;
}
