import type {
  AggregateValueDefinition,
  DocumentGroup,
  FormulaFieldBinding,
  NormalizedRecord,
  TemplateBlock,
  TemplateDefinition,
  TextStyle,
  TableBlock,
  TableFooterRowDefinition,
  CustomTableBlock,
  DisplayFormatDefinition,
} from '@document-tool/contracts';
import { TemplateEngine, createQrSvgDataUrl } from '@document-tool/template-engine';
import { CombinedPdfRenderer, PdfRenderer } from '@document-tool/renderer-pdf';
import type { BuilderDataSource } from './dataSourceStore.ts';
import { displayValue, valueForField } from './dataSourceStore.ts';
import { loadImageAsset } from './imageAssetStore.ts';
import { normalizePageSettings, type PageSettings, type WatermarkSettings } from './pageModel.ts';
import { amountToIndianWords } from './numberToWords.ts';
import {
  dynamicRows,
  evaluateTableFormula,
  type TableDataFormat,
  type TableDataType,
  type TableDefinition,
  type TableCell,
  type TableCellStyle,
} from './tableModel.ts';

export type NativePdfMode = 'native-auto' | 'exact';
export const PDF_RENDER_MODE_KEY = 'document-builder.pdf-render-mode.db5f.v1';

export function readPdfRenderMode(storage: Pick<Storage, 'getItem'>): NativePdfMode {
  return storage.getItem(PDF_RENDER_MODE_KEY) === 'exact' ? 'exact' : 'native-auto';
}
export function writePdfRenderMode(storage: Pick<Storage, 'setItem'>, mode: NativePdfMode) {
  storage.setItem(PDF_RENDER_MODE_KEY, mode);
}

type BuilderElement = {
  id: string;
  type: 'text'|'image'|'table'|'shape'|'qr'|'barcode'|'signature'|'divider'|'formula';
  x: number; y: number; width: number; height: number;
  text: string; fontSize: number; fontFamily?: string; fontWeight?: number; italic?: boolean; underline?: boolean; lineHeight?: number;
  textAlign: 'left'|'center'|'right'; fill: string; color: string; binding?: string;
  imageSource?: string; imageAssetId?: string; imageFit?: 'contain'|'cover'|'fill';
  imageBackground?: string; imageOpacity?: number; imageBorderStyle?: 'none'|'solid'|'dashed'|'dotted'; imageBorderWidth?: number; imageBorderColor?: string; imageBorderRadius?: number;
  imageBrightness?: number; imageContrast?: number; imageSaturation?: number; imageGrayscale?: number; imageSepia?: number; imageBlur?: number;
  imageShadowEnabled?: boolean; imageOriginalAssetId?: string; imageOriginalSource?: string;
  shapeKind?: string; shapeContentMode?: string; shapeMediaBinding?: string; shapeFillType?: string; shapeFillColor2?: string; shapeStrokeStyle?: string; shapeStrokeWidth?: number; shapeStrokeAlignment?: string; shapeCornerRadius?: number; shapeShadowEnabled?: boolean; shapeGlowEnabled?: boolean; shapeClipMedia?: boolean; shapeMediaOverlayOpacity?: number; conditionEnabled?: boolean;
  qrForeground?: string; qrBackground?: string; qrQuietZone?: number; qrErrorCorrection?: string; qrShowValue?: boolean;
  barcodeForeground?: string; barcodeBackground?: string; barcodeShowText?: boolean; barcodeTextSize?: number; barcodeBarHeight?: number; barcodeQuietZone?: number;
  table?: TableDefinition; region?: 'body'|'header'|'footer'; layoutMode?: 'flow'|'floating'; flowRowId?: string;
  flowWidthPercent?: number; flowGapBeforeMm?: number; flowGapAfterMm?: number; flowColumnGapMm?: number;
  formulaName?: string; formulaExpression?: string;
};
type BuilderPage = { id:string; name:string; settings:PageSettings; elements:BuilderElement[] };
type SavedBuilderTemplate = { name?:string; pages?:BuilderPage[]; elements?:BuilderElement[]; pageSize?:string; orientation?:string; updatedAt?:string; watermark?:WatermarkSettings };

type FormulaSpec = { id:string; name:string; alias:string; expression:string };
type StandaloneMediaSpec = {
  blockId:string;
  kind:'image'|'signature'|'qr'|'barcode';
  binding?:string;
  text?:string;
  fallbackSource?:string;
};
type CustomMediaSpec = {
  cellId:string;
  kind:'image'|'qr'|'barcode';
  binding?:string;
  text?:string;
  fallbackSource?:string;
};
type TableMediaSpec = {
  tableId:string;
  cellId:string;
  syntheticPath:string;
  kind:'image'|'qr'|'barcode';
  binding?:string;
  text?:string;
  fallbackSource?:string;
  grouped:boolean;
  groupedOutputPath?:string;
};
type PreparedNativePage = { template:TemplateDefinition; builderPageId:string; builderPageName:string };
type PreparedNativeTemplate = {
  pages:PreparedNativePage[];
  parentKeys:string[];
  formulas:FormulaSpec[];
  formulaMap:Map<string,string>;
  standaloneMedia:StandaloneMediaSpec[];
  customMedia:CustomMediaSpec[];
  tableMedia:TableMediaSpec[];
  groupedTables:TableDefinition[];
};

export type NativePdfCompatibility = { supported:boolean; reasons:string[]; warnings:string[] };
export type NativePdfTiming = { buildModelMs:number; renderMs:number; totalMs:number; pageCount:number };

const pxToMm = (px:number) => px * 25.4 / 96;
const alignment = (value?:string): 'LEFT'|'CENTER'|'RIGHT' => value === 'center' ? 'CENTER' : value === 'right' ? 'RIGHT' : 'LEFT';
const safeAlias = (name:string) => {
  const raw=name.trim().replace(/[^A-Za-z0-9_]+/g,'_').replace(/^([0-9])/,'_$1');
  return raw || 'formula';
};
const groupedSourcePath=(tableId:string)=>`__db5g_group_${safeAlias(tableId)}`;
const mediaSyntheticPath=(tableId:string,cellId:string)=>`__db5g_media_${safeAlias(tableId)}_${safeAlias(cellId)}`;

export function analyzeNativePdfCompatibility(raw: string | null, source?: BuilderDataSource | null): NativePdfCompatibility {
  const reasons:string[]=[]; const warnings:string[]=[];
  const saved=parseSaved(raw);
  if(!saved) return {supported:false,reasons:['Saved template could not be read.'],warnings:[]};
  const pages=normalizedBuilderPages(saved);
  const elements=pages.flatMap((page)=>page.elements ?? []);
  const dynamicSourceIds=new Set<string>();
  for(const element of elements){
    if(element.type==='table'&&element.table?.mode==='dynamic'&&element.table.binding?.sourceId) dynamicSourceIds.add(element.table.binding.sourceId);
    if(element.type==='table'&&element.table){
      const table=element.table;
      // Custom merged media grids are supported when their source can be resolved per document.
      // Multiple nested source collections are still deliberately rejected because Generate
      // currently provides one active flat imported source per request.
      if(table.binding?.parentSourceId && table.binding.parentSourceId !== source?.id) warnings.push(`Table ${table.name} uses a legacy parent source mapping; Native mode will use the active document context.`);
    }
  }
  if(dynamicSourceIds.size>1) reasons.push('Fast / Native currently supports one imported Data Source per generation request.');
  if(source&&dynamicSourceIds.size===1&&!dynamicSourceIds.has(source.id)) reasons.push('Selected Data Source does not match the template Dynamic Table source.');
  if(elements.some((e)=>e.layoutMode==='floating')) warnings.push('Floating body elements are converted to native document flow. Use Exact Preview when pixel-position fidelity is required.');
  if(elements.some((e)=>(e.type==='image'||e.type==='signature') && ((e.imageOpacity??100)!==100 || (e.imageBorderWidth??0)>0 || (e.imageBorderRadius??0)>0 || !!e.imageBackground || (e.imageBrightness??100)!==100 || (e.imageContrast??100)!==100 || (e.imageSaturation??100)!==100 || (e.imageGrayscale??0)>0 || (e.imageSepia??0)>0 || (e.imageBlur??0)>0 || !!e.imageShadowEnabled))) reasons.push('Advanced Image/Signature styling currently requires Exact Preview for visual fidelity.');
  if(elements.some((e)=>e.type==='shape' && ((e.shapeKind??'rectangle')!=='rectangle' || (e.shapeContentMode??(e.text?'text':'none'))!=='text' || (e.shapeFillType??'solid')!=='solid' || (e.shapeStrokeStyle??'none')!=='none' || (e.shapeStrokeWidth??0)>0 || (e.shapeStrokeAlignment??'center')!=='center' || (e.shapeCornerRadius??0)>0 || !!e.shapeShadowEnabled || !!e.shapeGlowEnabled || !!e.shapeMediaBinding))) reasons.push('Advanced Shape geometry, media or effects require Exact Preview for visual fidelity.');
  if(elements.some((e)=>e.type==='qr' && ((e.qrForeground??'#111827').toUpperCase()!=='#111827' || (e.qrBackground??'#FFFFFF').toUpperCase()!=='#FFFFFF' || (e.qrQuietZone??8)!==8 || (e.qrErrorCorrection??'M')!=='M' || (e.qrShowValue??true)!==true))) reasons.push('Advanced QR formatting currently requires Exact Preview for visual fidelity.');
  if(elements.some((e)=>e.type==='barcode' && ((e.barcodeForeground??'#111827').toUpperCase()!=='#111827' || (e.barcodeBackground??'#FFFFFF').toUpperCase()!=='#FFFFFF' || (e.barcodeShowText??true)!==true || (e.barcodeTextSize??11)!==11 || (e.barcodeBarHeight??54)!==54 || (e.barcodeQuietZone??8)!==8))) reasons.push('Advanced Barcode formatting currently requires Exact Preview for visual fidelity.');
  if(elements.some((e)=>!!e.conditionEnabled)) reasons.push('Conditional element visibility currently requires Exact Preview for visual fidelity.');
  const unsupportedFonts=[...new Set(elements.map((e)=>e.fontFamily).filter((font):font is string=>!!font&&!isNativeFont(font)))];
  if(unsupportedFonts.length) warnings.push(`Native PDF substitutes unsupported fonts with a core PDF font: ${unsupportedFonts.join(', ')}.`);
  return {supported:reasons.length===0,reasons:[...new Set(reasons)],warnings:[...new Set(warnings)]};
}

export async function renderNativeSinglePdf(input:{
  savedTemplateRaw:string|null; source:BuilderDataSource; recordIndex:number; fileName:string;
  onProgress?:(percent:number,message:string)=>void; onTiming?:(timing:NativePdfTiming)=>void;
}){
  const started=performance.now(); input.onProgress?.(5,'Preparing native document model…');
  const buildStarted=performance.now();
  const prepared=await prepareNativeTemplate(input.savedTemplateRaw,input.source);
  const group=await buildNativeDocumentGroup(prepared,input.source,input.recordIndex);
  const engine=new TemplateEngine();
  const rendered:Array<{template:TemplateDefinition;model:NonNullable<ReturnType<TemplateEngine['buildRenderModel']>['model']>;warnings:string[]}> = [];
  for(const page of prepared.pages){
    const nativeTemplate=await resolveNativeTemplateMedia(prepared,page.template,group.header);
    const built=engine.buildRenderModel(nativeTemplate,group);
    if(!built.model) throw new Error(built.errors.map((e:{message:string})=>e.message).join(' ')||'Unable to build native RenderModel.');
    rendered.push({template:nativeTemplate,model:built.model,warnings:built.warnings.map((w:{message:string})=>w.message)});
  }
  const buildModelMs=performance.now()-buildStarted;
  input.onProgress?.(35,'Rendering native PDF…');
  const renderStarted=performance.now();
  let bytes:Uint8Array; let pageCount=0; let fileName=input.fileName; const warnings=rendered.flatMap((item)=>item.warnings);
  if(rendered.length===1){
    const only=rendered[0]!;
    const output=await new PdfRenderer().render(only.template,only.model,{fileNamePrefix:input.fileName,options:{onDiagnostics:(d:any)=>{pageCount=Number(d.pageCount)||0;}}});
    bytes=output.content as Uint8Array; fileName=output.fileName;
  }else{
    const output=await new CombinedPdfRenderer().render(rendered.map((item,index)=>({documentGroupId:`${group.id}:page:${index}`,label:prepared.pages[index]?.builderPageName,template:item.template,model:item.model})),{fileNamePrefix:input.fileName,pageNumbering:'GLOBAL',totalDocumentsHint:rendered.length});
    bytes=output.content as Uint8Array; fileName=output.fileName; pageCount=output.totalPages;
  }
  const renderMs=performance.now()-renderStarted;
  input.onProgress?.(100,'PDF ready.');
  input.onTiming?.({buildModelMs,renderMs,totalMs:performance.now()-started,pageCount});
  return {bytes,fileName,pageCount,warnings};
}

export async function renderNativeCombinedPdf(input:{
  savedTemplateRaw:string|null; source:BuilderDataSource; recordIndexes:number[]; fileName:string;
  onProgress?:(percent:number,message:string,current:number,total:number)=>void;
}){
  if(!input.recordIndexes.length) throw new Error('Select at least one document.');
  const total=input.recordIndexes.length;
  input.onProgress?.(2,'Preparing native template…',0,total);
  const prepared=await prepareNativeTemplate(input.savedTemplateRaw,input.source);
  const engine=new TemplateEngine();
  const renderer=new CombinedPdfRenderer();
  const pageCountPerDocument=Math.max(1,prepared.pages.length);
  const sources=input.recordIndexes.flatMap((recordIndex,documentIndex)=>prepared.pages.map((page,pageIndex)=>({
    documentGroupId:`${input.source.id}:${recordIndex}:builder-page:${pageIndex}`,
    label:`Record ${recordIndex+1} · ${page.builderPageName}`,
    resolve:async()=>{
      const group=await buildNativeDocumentGroup(prepared,input.source,recordIndex);
      const nativeTemplate=await resolveNativeTemplateMedia(prepared,page.template,group.header);
      const built=engine.buildRenderModel(nativeTemplate,group);
      if(!built.model) throw new Error(built.errors.map((e:{message:string})=>e.message).join(' ')||`Unable to build native RenderModel for record ${recordIndex+1}.`);
      input.onProgress?.(Math.max(3,Math.round(((documentIndex+(pageIndex/pageCountPerDocument))/Math.max(1,total))*85)),`Prepared invoice ${documentIndex+1} of ${total}…`,documentIndex,total);
      return {template:nativeTemplate,model:built.model};
    },
  })));
  const output=await renderer.render(sources,{
    fileNamePrefix:input.fileName,totalDocumentsHint:total*pageCountPerDocument,pageNumbering:'GLOBAL',
    onProgress:(p:{percent:number;phase:string;currentDocument:number})=>{
      const invoice=Math.min(total,Math.max(1,Math.ceil(p.currentDocument/pageCountPerDocument)));
      input.onProgress?.(p.percent,p.phase==='FINALIZING'?'Finalizing combined PDF…':`Rendering invoice ${invoice} of ${total}…`,Math.max(0,invoice-1),total);
    },
  });
  input.onProgress?.(100,'Combined PDF ready.',total,total);
  return {bytes:output.content as Uint8Array,fileName:output.fileName,pageCount:output.totalPages,documents:output.documents};
}

async function prepareNativeTemplate(raw:string|null,source:BuilderDataSource):Promise<PreparedNativeTemplate>{
  const saved=parseSaved(raw);if(!saved)throw new Error('Saved template is unavailable.');
  const compatibility=analyzeNativePdfCompatibility(raw,source);if(!compatibility.supported)throw new Error(`Fast / Native PDF is not available for this template yet: ${compatibility.reasons.join(' ')}`);
  const pages=normalizedBuilderPages(saved);
  const allElements=pages.flatMap((page)=>page.elements??[]);
  const formulaMap=new Map<string,string>(); const formulas:FormulaSpec[]=[];
  for(const element of allElements.filter((item)=>item.type==='formula')){
    const name=element.formulaName?.trim();const expression=element.formulaExpression?.trim();if(!name||!expression)continue;
    const alias=safeAlias(name);formulaMap.set(name.toLocaleLowerCase(),alias);formulas.push({id:element.id,name,alias,expression});
  }
  const assetSources=await loadStaticAssetSources(allElements);
  const standaloneMedia:StandaloneMediaSpec[]=[]; const customMedia:CustomMediaSpec[]=[]; const tableMedia:TableMediaSpec[]=[]; const groupedTables:TableDefinition[]=[];
  for(const element of allElements){
    if(['image','signature','qr','barcode'].includes(element.type)){
      const kind=element.type as StandaloneMediaSpec['kind'];
      standaloneMedia.push({blockId:element.id,kind,binding:rewriteFormulaPath(element.binding,formulaMap),text:rewriteFormulaTokens(element.text??'',formulaMap),fallbackSource:element.imageSource||assetSources.get(element.imageAssetId??'')});
    }
    if(element.type==='table'&&element.table){
      const table=element.table;if(table.binding?.grouping)groupedTables.push(table);
      const body=table.bodyRows[0];
      body?.cells.forEach((cell,index)=>{
        if(cell.type==='image'||cell.type==='qr'||cell.type==='barcode'){
          const groupedOutputPath=table.binding?.grouping?.columns[index]?.outputKey;
          tableMedia.push({tableId:table.id,cellId:cell.id,syntheticPath:mediaSyntheticPath(table.id,cell.id),kind:cell.type,binding:rewriteFormulaPath(cell.binding,formulaMap),text:rewriteFormulaTokens(cell.content??'',formulaMap),fallbackSource:cell.imageSource||assetSources.get(cell.imageAssetId??''),grouped:Boolean(table.binding?.grouping),groupedOutputPath});
        }
      });
      if(table.mode==='custom'){
        const rows=table.rows.length?table.rows:table.customRows;
        rows.forEach((row)=>row.cells.forEach((cell)=>{if(cell.type==='image'||cell.type==='qr'||cell.type==='barcode')customMedia.push({cellId:cell.id,kind:cell.type,binding:rewriteFormulaPath(cell.binding,formulaMap),text:rewriteFormulaTokens(cell.content??'',formulaMap),fallbackSource:cell.imageSource||assetSources.get(cell.imageAssetId??'')});}));
      }
    }
  }
  const preparedPages:PreparedNativePage[]=[];
  for(const [pageIndex,page] of pages.entries()){
    const master=(page.elements??[]).filter((e)=>e.type!=='formula');
    const headerElements=master.filter((e)=>(e.region??'body')==='header');
    const bodyElements=master.filter((e)=>(e.region??'body')==='body');
    const footerElements=master.filter((e)=>(e.region??'body')==='footer');
    const template:TemplateDefinition={
      id:`builder-native:${page.id}`,name:saved.name?.trim()||'Document',version:1,
      page:toPageDefinition(page.settings),
      header:{blocks:page.settings.header.enabled?await convertRegion(headerElements,formulaMap,tableMedia,customMedia):[]},
      body:{blocks:await convertBody(bodyElements,formulaMap,tableMedia,customMedia)},
      footer:{blocks:page.settings.footer.enabled?await convertRegion(footerElements,formulaMap,tableMedia,customMedia):[]},
      calculatedFields:[],
      metadata:{nativeAdapter:'DB-5G-v1',updatedAt:saved.updatedAt,builderPageId:page.id,builderPageIndex:pageIndex},
    };
    preparedPages.push({template,builderPageId:page.id,builderPageName:page.name||`Page ${pageIndex+1}`});
  }
  const allBody=allElements.filter((e)=>(e.region??'body')==='body');
  return {pages:preparedPages,parentKeys:findParentKeys(allBody,source.id),formulas,formulaMap,standaloneMedia,customMedia,tableMedia,groupedTables};
}

async function buildNativeDocumentGroup(prepared:PreparedNativeTemplate,source:BuilderDataSource,recordIndex:number):Promise<DocumentGroup>{
  const safeIndex=Math.max(0,Math.min(recordIndex,Math.max(0,source.records.length-1)));
  const selected=(source.records[safeIndex]??{}) as NormalizedRecord;
  const matched=prepared.parentKeys.length
    ? source.records.map((row,index)=>({row:row as NormalizedRecord,index})).filter(({row})=>prepared.parentKeys.every((key)=>displayValue(valueForField(row,key)).trim()===displayValue(valueForField(selected,key)).trim()))
    : [{row:selected,index:safeIndex}];
  const rawRows=matched.map((item)=>item.row);
  const calc=evaluateDocumentFormulas(prepared.formulas,selected,rawRows);
  const header:NormalizedRecord={...selected,calc:calc as NormalizedRecord};

  // Grouped Summary Tables reuse the exact Builder grouping engine. The grouped
  // result is exposed as a synthetic root collection so native table rendering
  // can paginate it like an ordinary table without changing regular Detail rows.
  for(const table of prepared.groupedTables){
    const rows=dynamicRows(table,selected,source,source).map((item)=>item.value as NormalizedRecord);
    header[groupedSourcePath(table.id)]=await applyTableMedia(prepared,table,rows,header,true);
  }

  const items=await applyTableMedia(prepared,null,rawRows,header,false);
  return {
    id:`${source.id}:${safeIndex}`,
    key:prepared.parentKeys.map((key)=>displayValue(valueForField(selected,key))).join('|')||String(safeIndex),
    header,
    items,
    sourceItems:rawRows,
    itemDetails:matched.map(({row,index})=>({data:row,sourceRowIndex:index})),
    sourceRowIndexes:matched.map((item)=>item.index),
    warnings:[],valid:true,
  };
}

function parseSaved(raw:string|null):SavedBuilderTemplate|null{if(!raw)return null;try{return JSON.parse(raw) as SavedBuilderTemplate;}catch{return null;}}
function normalizedBuilderPages(saved:SavedBuilderTemplate):BuilderPage[]{
  if(saved.pages?.length){
    const normalized=saved.pages.map((page)=>({...page,settings:normalizePageSettings(page.settings)}));
    const globalWatermark={...(saved.watermark??normalized[0]?.settings.watermark??defaultLegacySettings(saved).watermark)};
    return normalized.map((page)=>({...page,settings:{...page.settings,watermark:{...globalWatermark}}}));
  }
  const settings=defaultLegacySettings(saved);
  if(saved.watermark) settings.watermark={...settings.watermark,...saved.watermark};
  return [{id:'page-1',name:'Page 1',settings,elements:saved.elements??[]}];
}
function defaultLegacySettings(saved:SavedBuilderTemplate):PageSettings{return {preset:(saved.pageSize as any)||'A4',orientation:(saved.orientation as any)||'Portrait',unit:'mm',customWidthMm:210,customHeightMm:297,marginsMm:{top:15,right:15,bottom:15,left:15},bleedMm:{top:0,right:0,bottom:0,left:0},safeAreaMm:5,background:'#ffffff',borderColor:'#d2d8e0',borderWidth:0,borderAlignment:'inside',borderOffsetMm:0,showGuides:false,header:{enabled:false,heightMm:20,gapMm:5,repeat:'every'},footer:{enabled:false,heightMm:15,gapMm:5,repeat:'every'},watermark:{enabled:false,type:'text',text:'CONFIDENTIAL',opacity:20,rotation:-45,fontSize:56,color:'#64748B',position:'center',scale:60,customXPercent:50,customYPercent:50,applyTo:'all',layer:'behind'}};}
function toPageDefinition(s:PageSettings):TemplateDefinition['page']{
  const preset=String(s.preset).toUpperCase();const size=(preset==='LETTER'||preset==='LEGAL'||preset==='TABLOID'||preset==='LEDGER'||preset==='EXECUTIVE'||/^[AB][0-9]+$/.test(preset))?preset:'CUSTOM';
  const headerMode=s.header.repeat==='first'?'FIRST_PAGE_ONLY':s.header.repeat==='exceptFirst'?'EXCEPT_FIRST':'EVERY_PAGE';
  const footerMode=s.footer.enabled?(s.footer.repeat==='first'?'FIRST_PAGE_ONLY':s.footer.repeat==='exceptFirst'?'EXCEPT_FIRST':'REPEAT_PAGE'):'FLOW';
  const watermarkPosition=s.watermark.position.replace(/-/g,'_').toUpperCase();
  return {size:size as any,orientation:s.orientation==='Landscape'?'LANDSCAPE':'PORTRAIT',margins:{...s.marginsMm},customWidthMm:s.customWidthMm,customHeightMm:s.customHeightMm,backgroundColor:s.background,border:{enabled:s.borderWidth>0,style:'SOLID',width:s.borderWidth,color:s.borderColor,offset:s.borderOffsetMm},pagination:{repeatHeader:s.header.enabled&&s.header.repeat==='every',headerMode:s.header.enabled?headerMode:'FIRST_PAGE_ONLY',footerMode,showPageNumbers:false,keepSummaryTogether:true,keepCustomGridTogether:true},watermark:{enabled:s.watermark.enabled,type:s.watermark.type==='image'?'IMAGE':'TEXT',text:s.watermark.text,imageSource:s.watermark.imageSource,opacity:Math.max(0,Math.min(1,s.watermark.opacity/100)),rotation:s.watermark.rotation,fontSize:Math.max(6,s.watermark.fontSize*72/96),color:s.watermark.color,position:(['CENTER','TOP_LEFT','TOP_RIGHT','BOTTOM_LEFT','BOTTOM_RIGHT','CUSTOM'].includes(watermarkPosition)?watermarkPosition:'CENTER') as NonNullable<TemplateDefinition['page']['watermark']>['position'],scale:Math.max(.05,Math.min(2,s.watermark.scale/100)),customXPercent:Math.max(0,Math.min(100,s.watermark.customXPercent)),customYPercent:Math.max(0,Math.min(100,s.watermark.customYPercent)),applyTo:s.watermark.applyTo==='first'?'FIRST_PAGE':'ALL',layer:s.watermark.layer==='above'?'ABOVE':'BEHIND'}};
}
function findParentKeys(elements:BuilderElement[],sourceId:string){for(const e of elements){if(e.type==='table'&&e.table?.mode==='dynamic'&&(!e.table.binding?.sourceId||e.table.binding.sourceId===sourceId)){const keys=e.table.binding?.parentKeys?.filter(Boolean)??(e.table.binding?.parentKey?[e.table.binding.parentKey]:[]);if(keys.length)return keys;}}return [] as string[];}

async function convertBody(elements:BuilderElement[],formulaMap:Map<string,string>,tableMedia:TableMediaSpec[],customMedia:CustomMediaSpec[]):Promise<TemplateBlock[]>{
  const sorted=[...elements].sort((a,b)=>a.y-b.y||a.x-b.x);const out:TemplateBlock[]=[];const consumed=new Set<string>();
  for(const element of sorted){
    if(consumed.has(element.id))continue;const rowId=element.flowRowId;const siblings=rowId?sorted.filter((e)=>e.flowRowId===rowId):[element];
    if(rowId&&siblings.length>1){
      siblings.forEach((e)=>consumed.add(e.id));const children=await Promise.all(siblings.sort((a,b)=>a.x-b.x).map((e)=>convertElement(e,formulaMap,true,tableMedia,customMedia)));
      out.push({id:`row:${rowId}`,type:'ROW',children:children.filter(Boolean) as any[],gap:Math.max(...siblings.map((e)=>e.flowColumnGapMm??2)),verticalAlignment:'TOP',layout:{widthPercent:100,marginTop:Math.min(...siblings.map((e)=>e.flowGapBeforeMm??0)),marginBottom:Math.max(...siblings.map((e)=>e.flowGapAfterMm??0))}});
    }else{consumed.add(element.id);const block=await convertElement(element,formulaMap,false,tableMedia,customMedia);if(block)out.push(block);}
  }
  return out;
}
async function convertRegion(elements:BuilderElement[],formulaMap:Map<string,string>,tableMedia:TableMediaSpec[],customMedia:CustomMediaSpec[]):Promise<TemplateBlock[]>{
  const sorted=[...elements].sort((a,b)=>a.y-b.y||a.x-b.x);const out:TemplateBlock[]=[];let previousBottom:number|null=null;
  for(const element of sorted){const block=await convertElement(element,formulaMap,false,tableMedia,customMedia);if(!block)continue;const gap=previousBottom==null?0:Math.max(0,pxToMm(element.y-previousBottom));block.layout={...(block.layout??{}),marginTop:gap};out.push(block);previousBottom=Math.max(element.y+element.height,previousBottom??0);}return out;
}
async function convertElement(element:BuilderElement,formulaMap:Map<string,string>,inRow:boolean,tableMedia:TableMediaSpec[],customMedia:CustomMediaSpec[]):Promise<TemplateBlock|null>{
  const layout={widthPercent:inRow?100:Math.max(1,Math.min(100,element.flowWidthPercent??100)),alignment:alignment(element.textAlign),marginTop:element.flowGapBeforeMm??0,marginBottom:element.flowGapAfterMm??0,keepTogether:element.type!=='table'} as any;
  const style:TextStyle={fontFamily:nativeFontFamily(element.fontFamily),fontSize:Math.max(6,element.fontSize||11),bold:(element.fontWeight??400)>=600,italic:!!element.italic,underline:!!element.underline,textColor:element.color||'#111827',backgroundColor:element.fill&&element.fill!=='transparent'?element.fill:undefined,alignment:alignment(element.textAlign),lineHeight:element.lineHeight};
  if(element.type==='text'){
    const binding=rewriteFormulaPath(element.binding,formulaMap);if(binding)return {id:element.id,type:'FIELD',path:binding,valueStyle:style,textAlignment:alignment(element.textAlign),layout};
    return {id:element.id,type:'TEXT',text:rewriteFormulaTokens(element.text??'',formulaMap),style,layout};
  }
  if(element.type==='divider')return {id:element.id,type:'DIVIDER',thickness:Math.max(.2,pxToMm(Math.max(1,element.height))),color:element.color||'#94A3B8',style:'SOLID',layout};
  if(element.type==='shape'){
    const child=element.binding?{id:`${element.id}:value`,type:'FIELD' as const,path:rewriteFormulaPath(element.binding,formulaMap)!,valueStyle:style,textAlignment:alignment(element.textAlign)}:{id:`${element.id}:text`,type:'TEXT' as const,text:rewriteFormulaTokens(element.text??'',formulaMap),style};
    return {id:element.id,type:'BOX',style:{widthMode:'PERCENT',widthPercent:layout.widthPercent,heightMode:'FIXED',heightMm:pxToMm(element.height),backgroundColor:element.fill||'#ffffff',border:{width:0,color:element.color||'#000000',style:'NONE'},padding:{top:1,right:1,bottom:1,left:1},horizontalAlignment:alignment(element.textAlign),verticalAlignment:'CENTER'},children:[child] as any,layout};
  }
  if(element.type==='image'||element.type==='signature'){
    let source=element.imageSource||'';if(!source&&element.imageAssetId){const blob=await loadImageAsset(element.imageAssetId);if(blob)source=await blobToDataUrl(blob);}if(source)source=await normalizeNativeImageSource(source);if(!source&&element.binding)source=EMPTY_JPEG_DATA_URL;if(!source)return null;
    return {id:element.id,type:'IMAGE',sourceType:'DATA_URL',source,altText:element.type==='signature'?'Signature':'Image',width:pxToMm(element.width),height:pxToMm(element.height),maintainAspectRatio:element.imageFit!=='fill',alignment:alignment(element.textAlign),layout};
  }
  if(element.type==='qr'||element.type==='barcode'){
    const value=element.text?.trim()||' ';const source=element.type==='qr'?createQrSvgDataUrl(value):createCode39SvgDataUrl(value);
    return {id:element.id,type:'IMAGE',sourceType:'DATA_URL',source,altText:element.type==='qr'?'QR Code':'Barcode',width:pxToMm(element.width),height:pxToMm(element.height),maintainAspectRatio:false,alignment:alignment(element.textAlign),layout};
  }
  if(element.type==='table'&&element.table)return convertTable(element,layout,tableMedia,customMedia,formulaMap);
  return null;
}

function convertTable(element:BuilderElement,layout:any,tableMedia:TableMediaSpec[],customMedia:CustomMediaSpec[],formulaMap:Map<string,string>):TableBlock|CustomTableBlock{
  const t=element.table!;
  if(t.mode==='custom'){
    const rows=t.rows.length?t.rows:t.customRows;const cells:any[]=[];
    rows.forEach((row,rowIndex)=>row.cells.forEach((cell,columnIndex)=>{
      const media=customMedia.find((item)=>item.cellId===cell.id);
      let content:any;
      if(media){
        const source=media.kind==='qr'?createQrSvgDataUrl(media.text||' '):media.kind==='barcode'?createCode39SvgDataUrl(media.text||' '):(media.fallbackSource||EMPTY_JPEG_DATA_URL);
        content={type:'IMAGE',sourceType:'DATA_URL',source,altText:media.kind==='qr'?'QR Code':media.kind==='barcode'?'Barcode':'Image',width:pxToMm(Math.max(12,t.columns[columnIndex]?.width??80)),height:pxToMm(row.height),maintainAspectRatio:media.kind==='image'};
      }else if(cell.binding) content={type:'FIELD',path:rewriteFormulaPath(cell.binding,formulaMap),style:cellTextStyle(cell.style)};
      else content={type:'TEXT',text:cell.content||'',style:cellTextStyle(cell.style)};
      cells.push({id:cell.id,row:rowIndex,column:columnIndex,rowSpan:cell.rowSpan||1,colSpan:cell.colSpan||1,content,style:{backgroundColor:cell.style.background,border:{width:t.borderWidth,color:t.borderColor,style:borderStyle(t.borderStyle)},padding:{top:pxToMm(cell.style.padding),right:pxToMm(cell.style.padding),bottom:pxToMm(cell.style.padding),left:pxToMm(cell.style.padding)},verticalAlignment:cell.style.verticalAlign==='bottom'?'BOTTOM':cell.style.verticalAlign==='middle'?'CENTER':'TOP'}});
    }));
    return {id:element.id,type:'CUSTOM_TABLE',rowCount:rows.length,columnCount:t.columns.length,cells,tableStyle:{showBorder:t.borderStyle!=='none'&&t.borderWidth>0,widthPercent:layout.widthPercent,border:{width:t.borderWidth,color:t.borderColor,style:borderStyle(t.borderStyle)},cellPadding:{top:pxToMm(t.defaultPadding),right:pxToMm(t.defaultPadding),bottom:pxToMm(t.defaultPadding),left:pxToMm(t.defaultPadding)}},layout};
  }
  const body=t.bodyRows[0];const header=t.headerRows[0];const grouping=t.binding?.grouping;const totalWidth=Math.max(1,t.columns.reduce((sum,c)=>sum+Math.max(1,c.width),0));
  const sourcePath=grouping?groupedSourcePath(t.id):'items';
  const columns=t.columns.map((c,index)=>{
    const cell=body?.cells[index];const h=header?.cells[index];const media=cell?tableMedia.find((item)=>item.cellId===cell.id):undefined;const groupedColumn=grouping?.columns[index];
    const defaultPath=grouping?(groupedColumn?.outputKey||c.key):(cell?.binding||c.key);
    const base:any={id:c.id,label:h?.content||groupedColumn?.label||c.label||c.key,path:media?.syntheticPath||defaultPath,sourceField:defaultPath,targetPath:defaultPath,widthPercent:(Math.max(1,c.width)/totalWidth)*100,alignment:alignment(c.align),headerAlignment:alignment(h?.style.align||c.align),headerStyle:h?cellTextStyle(h.style):undefined,cellStyle:cell?cellTextStyle(cell.style):undefined,format:toDisplayFormat(c.dataType,c.format)};
    if(media){base.kind=media.kind==='qr'?'QR':'IMAGE';base.imageWidthMm=Math.max(10,pxToMm(c.width*.72));base.imageHeightMm=Math.max(10,pxToMm(body?.height??30)*.9);}
    else if(!grouping&&cell?.valueMode==='formula'&&cell.formula){const converted=convertFormulaExpression(cell.formula,t,sourcePath);base.kind='FORMULA';base.formulaExpression=converted.expression;base.formulaBindings=converted.bindings;}
    return base;
  });
  const footerRows:TableFooterRowDefinition[]=t.customRows.map((row)=>({id:row.id,cells:row.cells.map((cell,index)=>({id:cell.id,columnId:t.columns[index]?.id,colspan:cell.colSpan||1,value:footerValue(cell,t,sourcePath),alignment:alignment(cell.style.align),style:cellTextStyle(cell.style)})),backgroundColor:row.cells[0]?.style.background}));
  return {id:element.id,type:'TABLE',sourcePath,columns,footerRows,tableStyle:{showHeader:t.headerRows.length>0,showBorder:t.borderStyle!=='none'&&t.borderWidth>0,widthPercent:layout.widthPercent,border:{width:t.borderWidth,color:t.borderColor,style:borderStyle(t.borderStyle)},headerStyle:header?.cells[0]?cellTextStyle(header.cells[0].style):undefined,cellStyle:body?.cells[0]?cellTextStyle(body.cells[0].style):undefined,cellPadding:{top:pxToMm(t.defaultPadding),right:pxToMm(t.defaultPadding),bottom:pxToMm(t.defaultPadding),left:pxToMm(t.defaultPadding)}},layout:{...layout,keepTogether:false}};
}

function footerValue(cell:TableCell,table:TableDefinition,sourcePath:string):AggregateValueDefinition{
  if(cell.summaryMode==='formula'&&cell.summaryFormula){const converted=convertFormulaExpression(cell.summaryFormula,table,sourcePath);return {operation:'FORMULA',expression:converted.expression,formulaBindings:converted.bindings,sourcePath};}
  if(cell.summaryMode==='aggregate'&&cell.aggregate)return {operation:cell.aggregate.operation.toUpperCase() as any,path:fieldPathForTableReference(table,cell.aggregate.field),sourceField:cell.aggregate.field,targetPath:fieldPathForTableReference(table,cell.aggregate.field),sourcePath};
  if(cell.valueMode==='binding'&&cell.binding)return {operation:'FIELD',path:cell.binding};
  return {operation:'STATIC',staticValue:cell.content||''};
}
function convertFormulaExpression(expression:string,table:TableDefinition,sourcePath:string){
  const bindings:FormulaFieldBinding[]=[];let index=0;
  const converted=expression.replace(/\[([^\]]+)\]/g,(_full,nameRaw:string)=>{const name=nameRaw.trim();const id=`b${index++}`;const path=fieldPathForTableReference(table,name);bindings.push({id,label:name,path,sourceField:name,targetPath:path,sourcePath});return `{{${id}}}`;});
  return {expression:converted,bindings};
}
function fieldPathForTableReference(table:TableDefinition,name:string){
  const normalized=name.trim().toLocaleLowerCase();const grouping=table.binding?.grouping;
  const grouped=grouping?.columns.find((column)=>column.label?.trim().toLocaleLowerCase()===normalized||column.field?.trim().toLocaleLowerCase()===normalized||column.outputKey?.trim().toLocaleLowerCase()===normalized);
  if(grouped)return grouped.outputKey;
  const index=table.columns.findIndex((column)=>column.label.trim().toLocaleLowerCase()===normalized||column.key.trim().toLocaleLowerCase()===normalized);
  const body=table.bodyRows[0]?.cells[index];return body?.binding||table.columns[index]?.key||name;
}

function cellTextStyle(s:TableCellStyle):TextStyle{return {fontSize:s.fontSize,bold:s.bold,textColor:s.color,backgroundColor:s.background,alignment:alignment(s.align)};}
function borderStyle(s?:string):'NONE'|'SOLID'|'DASHED'{return s==='none'?'NONE':s==='dashed'||s==='dotted'?'DASHED':'SOLID';}
function toDisplayFormat(type?:TableDataType,format?:TableDataFormat):DisplayFormatDefinition|undefined{if(!type||type==='text')return undefined;if(type==='number'||type==='decimal')return {type:'NUMBER',decimals:type==='number'?0:(format?.decimals??2),useGrouping:format?.thousandsSeparator!==false};if(type==='currency')return {type:'CURRENCY',decimals:format?.decimals??2,useGrouping:format?.thousandsSeparator!==false,currencyCode:format?.currencyCode,currencySymbol:format?.currencySymbol};if(type==='percentage')return {type:'PERCENT',decimals:format?.decimals??2,percentInputMode:format?.percentInputMode==='whole'?'WHOLE':'FRACTION'};if(type==='date')return {type:'DATE',dateStyle:'SHORT'};if(type==='datetime')return {type:'DATETIME',dateStyle:'SHORT'};if(type==='checkbox')return {type:'BOOLEAN',trueLabel:format?.trueValue,falseLabel:format?.falseValue};return undefined;}
function rewriteFormulaTokens(text:string,map:Map<string,string>){return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(full,name:string)=>{const alias=map.get(name.trim().toLocaleLowerCase());return alias?`{{calc.${alias}}}`:full;});}
function rewriteFormulaPath(path:string|undefined,map:Map<string,string>){if(!path)return path;const alias=map.get(path.trim().toLocaleLowerCase());return alias?`calc.${alias}`:path;}

function evaluateDocumentFormulas(formulas:FormulaSpec[],record:NormalizedRecord,aggregateRows:NormalizedRecord[]){
  const context:NormalizedRecord={...record};const resolved:NormalizedRecord={};const unresolved=new Set(formulas.map((item)=>item.id));
  for(let pass=0;pass<formulas.length&&unresolved.size;pass+=1){let progressed=false;for(const formula of formulas){if(!unresolved.has(formula.id))continue;const value=evaluateDocumentFormulaExpression(formula.expression,context,aggregateRows);if(value==null)continue;context[formula.name]=value;resolved[formula.alias]=value;unresolved.delete(formula.id);progressed=true;}if(!progressed)break;}
  return resolved;
}
function evaluateDocumentFormulaExpression(expression:string|undefined,scalarContext:NormalizedRecord,aggregateRows:NormalizedRecord[]):string|number|null{
  if(!expression?.trim())return null;const words=unwrapWholeFormulaFunction(expression,['NUMBER_TO_WORDS','AMOUNT_IN_WORDS','INR_WORDS']);if(words){const numeric=evaluateDocumentFormulaExpression(words.inner,scalarContext,aggregateRows);return typeof numeric==='number'&&Number.isFinite(numeric)?amountToIndianWords(numeric):null;}
  const replaced=expression.replace(/\b(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*(?:(?:\[([^\]]+)\])|([A-Za-z_$][A-Za-z0-9_.$]*))?\s*\)/gi,(_full,opRaw,bracketField,bareField)=>{const op=String(opRaw).toUpperCase() as 'SUM'|'COUNT'|'AVG'|'MIN'|'MAX';const field=String(bracketField||bareField||'').trim();if(op==='COUNT'&&!field)return String(aggregateRows.length);return String(formulaAggregateValue(aggregateRows,field,op));});
  return evaluateTableFormula(replaced,scalarContext);
}
function formulaAggregateValue(rows:NormalizedRecord[],field:string,operation:'SUM'|'COUNT'|'AVG'|'MIN'|'MAX'){
  const values=rows.map((row)=>valueForField(row,field)).filter((value)=>value!==undefined&&value!==null&&value!=='');if(operation==='COUNT')return values.length;const nums=values.map(numericValue).filter((value):value is number=>value!=null);if(operation==='SUM')return nums.reduce((a,b)=>a+b,0);if(operation==='AVG')return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:0;if(operation==='MIN')return nums.length?Math.min(...nums):0;return nums.length?Math.max(...nums):0;
}
function numericValue(value:unknown){if(typeof value==='number')return Number.isFinite(value)?value:null;if(typeof value==='boolean')return value?1:0;if(value==null||value==='')return null;const n=Number(String(value).trim().replace(/,/g,'').replace(/[%₹$€£]/g,''));return Number.isFinite(n)?n:null;}
function unwrapWholeFormulaFunction(expression:string,names:string[]){const trimmed=expression.trim();const open=trimmed.indexOf('(');if(open<=0||!trimmed.endsWith(')'))return null;const name=trimmed.slice(0,open).trim().toUpperCase();if(!names.includes(name))return null;let depth=0;for(let i=open;i<trimmed.length;i+=1){if(trimmed[i]==='(')depth+=1;if(trimmed[i]===')')depth-=1;if(depth===0&&i!==trimmed.length-1)return null;if(depth<0)return null;}return depth===0?{name,inner:trimmed.slice(open+1,-1).trim()}:null;}

async function applyTableMedia(prepared:PreparedNativeTemplate,table:TableDefinition|null,rows:NormalizedRecord[],header:NormalizedRecord,grouped:boolean){
  const relevant=prepared.tableMedia.filter((spec)=>spec.grouped===grouped&&(!table||spec.tableId===table.id));if(!relevant.length)return rows.map((row)=>({...row}));
  return await Promise.all(rows.map(async(row)=>{const next:NormalizedRecord={...row};for(const spec of relevant){const basePath=grouped?(spec.groupedOutputPath||spec.binding):spec.binding;let raw=basePath?valueForField(row,basePath):undefined;if((raw==null||raw==='')&&basePath)raw=valueForField(header,basePath);if((raw==null||raw==='')&&spec.text)raw=resolveTemplateTokensSimple(spec.text,{...header,...row});if((raw==null||raw==='')&&spec.fallbackSource)raw=spec.fallbackSource;const value=String(raw??'').trim();if(spec.kind==='image')next[spec.syntheticPath]=(await normalizeNativeImageSource(value))||EMPTY_JPEG_DATA_URL;else if(spec.kind==='qr')next[spec.syntheticPath]=value;else next[spec.syntheticPath]=createCode39SvgDataUrl(value||' ');}return next;}));
}

async function resolveNativeTemplateMedia(prepared:PreparedNativeTemplate,template:TemplateDefinition,record:NormalizedRecord):Promise<TemplateDefinition>{
  const standalone=new Map<string,string>();for(const spec of prepared.standaloneMedia){let raw=spec.binding?valueForField(record,spec.binding):undefined;if((raw==null||raw==='')&&spec.text)raw=resolveTemplateTokensSimple(spec.text,record);const text=String(raw??'').trim();if(spec.kind==='image'||spec.kind==='signature'){const candidate=text||spec.fallbackSource||'';standalone.set(spec.blockId,(await normalizeNativeImageSource(candidate))||EMPTY_JPEG_DATA_URL);}else if(spec.kind==='qr')standalone.set(spec.blockId,createQrSvgDataUrl(text||' '));else standalone.set(spec.blockId,createCode39SvgDataUrl(text||' '));}
  const custom=new Map<string,string>();for(const spec of prepared.customMedia){let raw=spec.binding?valueForField(record,spec.binding):undefined;if((raw==null||raw==='')&&spec.text)raw=resolveTemplateTokensSimple(spec.text,record);const text=String(raw??'').trim();if(spec.kind==='image')custom.set(spec.cellId,(await normalizeNativeImageSource(text||spec.fallbackSource||''))||EMPTY_JPEG_DATA_URL);else if(spec.kind==='qr')custom.set(spec.cellId,createQrSvgDataUrl(text||' '));else custom.set(spec.cellId,createCode39SvgDataUrl(text||' '));}
  const replace=(blocks:TemplateBlock[]):TemplateBlock[]=>blocks.map((block:any)=>{
    if(block.type==='IMAGE'&&standalone.has(block.id))return {...block,sourceType:'DATA_URL',source:standalone.get(block.id)!};
    if(block.type==='CUSTOM_TABLE'&&custom.size)return {...block,cells:block.cells.map((cell:any)=>custom.has(cell.id)?{...cell,content:{...cell.content,type:'IMAGE',sourceType:'DATA_URL',source:custom.get(cell.id)!}}:cell)};
    if(block.type==='ROW')return {...block,children:replace(block.children??[]),columns:block.columns?.map((column:any)=>({...column,children:replace(column.children??[])}))};
    if(block.type==='BOX')return {...block,children:replace(block.children??[])};
    return block;
  });
  return {...template,header:{...template.header,blocks:replace(template.header.blocks??[])},body:{...template.body,blocks:replace(template.body.blocks??[])},footer:{...template.footer,blocks:replace(template.footer.blocks??[])}};
}

function resolveTemplateTokensSimple(text:string,context:NormalizedRecord){return String(text??'').replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_full,path)=>displayValue(valueForField(context,String(path).trim())??''));}
function isNativeFont(font:string){return ['Arial','Calibri','Times New Roman','Georgia','Verdana','Tahoma','Courier New','Segoe UI','system-ui','sans-serif','serif','monospace'].includes(font);}
function nativeFontFamily(font?:string):TextStyle['fontFamily']{if(!font)return'Arial';if(font==='Times New Roman'||font==='serif'||font==='Georgia')return'Times New Roman';if(font==='Courier New'||font==='monospace')return'Courier New';return isNativeFont(font)?font as TextStyle['fontFamily']:'Arial';}

async function loadStaticAssetSources(elements:BuilderElement[]){const ids=new Set<string>();for(const element of elements){if(element.imageAssetId)ids.add(element.imageAssetId);if(element.table){const rows=[...element.table.bodyRows,...element.table.customRows,...element.table.rows];for(const row of rows)for(const cell of row.cells)if(cell.imageAssetId)ids.add(cell.imageAssetId);}}const map=new Map<string,string>();for(const id of ids){try{const blob=await loadImageAsset(id);if(blob)map.set(id,await blobToDataUrl(blob));}catch{/* preserve fallback behavior */}}return map;}
async function blobToDataUrl(blob:Blob):Promise<string>{return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error??new Error('Unable to read image asset.'));reader.readAsDataURL(blob);});}

const EMPTY_JPEG_DATA_URL='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooA//2Q==';
const nativeImageCache=new Map<string,Promise<string>>();
async function normalizeNativeImageSource(raw:string):Promise<string>{const source=String(raw??'').trim();if(!source)return'';if(/^data:image\/(?:png|jpe?g|webp);base64,/i.test(source))return source.replace(/^data:image\/jpg;/i,'data:image/jpeg;');if(/^data:image\/svg\+xml/i.test(source))return source;if(/^(?:https?:|blob:)/i.test(source)){let pending=nativeImageCache.get(source);if(!pending){pending=(async()=>{const response=await fetch(source);if(!response.ok)throw new Error(`Unable to load image (${response.status}).`);return blobToDataUrl(await response.blob());})();nativeImageCache.set(source,pending);}try{return await pending;}catch{nativeImageCache.delete(source);return'';}}if(/^[A-Za-z0-9+/=\s]{128,}$/.test(source))return`data:image/png;base64,${source.replace(/\s+/g,'')}`;return'';}

const CODE39:Record<string,string>={
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
  'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
  'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
  'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn','/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn',
};
function createCode39SvgDataUrl(value:string){const safe=String(value??'').toUpperCase().split('').map((ch)=>CODE39[ch]?ch:'-').join('');const encoded=`*${safe||'-'}*`;const narrow=1,wide=3,gap=1,height=44,quiet=10;let x=quiet;const bars:Array<{x:number;width:number}>=[];for(const ch of encoded){const pattern=CODE39[ch]??CODE39['-']!;for(let i=0;i<pattern.length;i+=1){const width=pattern[i]==='w'?wide:narrow;if(i%2===0)bars.push({x,width});x+=width;}x+=gap;}const width=x+quiet;const rects=bars.map((bar)=>`<rect x="${bar.x}" y="0" width="${bar.width}" height="${height}" fill="#000"/>`).join('');const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/>${rects}</svg>`;return`data:image/svg+xml,${encodeURIComponent(svg)}`;}
