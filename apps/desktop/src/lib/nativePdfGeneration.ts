import type {
  CalculatedFieldDefinition,
  DocumentGroup,
  TemplateBlock,
  TemplateDefinition,
  TextStyle,
  TableBlock,
  TableFooterRowDefinition,
  CustomTableBlock,
  DisplayFormatDefinition,
} from '@document-tool/contracts';
import { TemplateEngine } from '@document-tool/template-engine';
import { CombinedPdfRenderer, PdfRenderer } from '@document-tool/renderer-pdf';
import type { BuilderDataSource } from './dataSourceStore.ts';
import { displayValue, valueForField } from './dataSourceStore.ts';
import { loadImageAsset } from './imageAssetStore.ts';
import type { PageSettings } from './pageModel.ts';
import type { TableDataFormat, TableDataType, TableDefinition, TableCell, TableCellStyle } from './tableModel.ts';

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
  table?: TableDefinition; region?: 'body'|'header'|'footer'; layoutMode?: 'flow'|'floating'; flowRowId?: string;
  flowWidthPercent?: number; flowGapBeforeMm?: number; flowGapAfterMm?: number; flowColumnGapMm?: number;
  formulaName?: string; formulaExpression?: string;
};
type BuilderPage = { id:string; name:string; settings:PageSettings; elements:BuilderElement[] };
type SavedBuilderTemplate = { name?:string; pages?:BuilderPage[]; elements?:BuilderElement[]; pageSize?:string; orientation?:string; updatedAt?:string };

export type NativePdfCompatibility = { supported:boolean; reasons:string[]; warnings:string[] };
export type NativePdfTiming = { buildModelMs:number; renderMs:number; totalMs:number; pageCount:number };

const pxToMm = (px:number) => px * 25.4 / 96;
const alignment = (value?:string): 'LEFT'|'CENTER'|'RIGHT' => value === 'center' ? 'CENTER' : value === 'right' ? 'RIGHT' : 'LEFT';
const safeAlias = (name:string) => {
  const raw=name.trim().replace(/[^A-Za-z0-9_]+/g,'_').replace(/^([0-9])/,'_$1');
  return raw || 'formula';
};

export function analyzeNativePdfCompatibility(raw: string | null, source?: BuilderDataSource | null): NativePdfCompatibility {
  const reasons:string[]=[]; const warnings:string[]=[];
  const saved=parseSaved(raw); const pages=saved?.pages ?? [];
  if(!saved) reasons.push('Saved template could not be read.');
  if(pages.length > 1) reasons.push('Native v1 supports one Builder page plus automatic overflow; multi-builder-page templates use Exact mode.');
  const elements=(pages[0]?.elements ?? saved?.elements ?? []) as BuilderElement[];
  const settings=pages[0]?.settings;
  if(settings?.header?.enabled && settings.header.repeat!=='every') reasons.push(`Header repeat mode ${settings.header.repeat} currently requires Exact mode.`);
  if(settings?.footer?.enabled && settings.footer.repeat!=='every') reasons.push(`Footer repeat mode ${settings.footer.repeat} currently requires Exact mode.`);
  const dynamicSourceIds=new Set<string>();
  for(const element of elements){
    if(element.type==='qr' || element.type==='barcode') reasons.push(`${element.type.toUpperCase()} element ${element.id} is not native-v1 compatible.`);
    if(element.type==='formula' && /NUMBER_TO_WORDS|AMOUNT_IN_WORDS|INR_WORDS/i.test(element.formulaExpression ?? '')) reasons.push(`Formula field ${element.formulaName || element.id} uses words conversion that currently requires Exact mode.`);
    if(element.type==='table' && element.table){
      const table=element.table;
      if(table.binding?.grouping) reasons.push(`Grouped Summary table ${table.name} currently requires Exact mode.`);
      if(table.mode==='dynamic' && table.binding?.sourceId) dynamicSourceIds.add(table.binding.sourceId);
      if(table.customRows.some((row)=>row.cells.some((cell)=>cell.summaryMode==='formula'))) reasons.push(`Summary formula in ${table.name} currently requires Exact mode.`);
      if(table.bodyRows.some((row)=>row.cells.some((cell)=>cell.type==='image'||cell.type==='qr'||cell.type==='barcode'))) reasons.push(`Media cells in ${table.name} currently require Exact mode.`);
    }
  }
  if(dynamicSourceIds.size>1) reasons.push('Native v1 supports one imported source per template.');
  if(source && dynamicSourceIds.size===1 && !dynamicSourceIds.has(source.id)) reasons.push('Selected Data Source does not match the template Dynamic Table source.');
  if(elements.some((e)=>e.layoutMode==='floating')) warnings.push('Floating body elements are converted to document flow in Fast / Native mode. Use Exact mode for pixel-position fidelity.');
  return {supported:reasons.length===0,reasons:[...new Set(reasons)],warnings:[...new Set(warnings)]};
}

export async function renderNativeSinglePdf(input:{
  savedTemplateRaw:string|null; source:BuilderDataSource; recordIndex:number; fileName:string;
  onProgress?:(percent:number,message:string)=>void; onTiming?:(timing:NativePdfTiming)=>void;
}){
  const started=performance.now(); input.onProgress?.(5,'Preparing native document model…');
  const buildStarted=performance.now();
  const prepared=await prepareNativeTemplate(input.savedTemplateRaw,input.source);
  const group=buildNativeDocumentGroup(prepared,input.source,input.recordIndex);
  const nativeTemplate=await resolveNativeTemplateImages(prepared,group.header);
  const engine=new TemplateEngine(); const built=engine.buildRenderModel(nativeTemplate,group);
  if(!built.model) throw new Error(built.errors.map((e: { message:string })=>e.message).join(' ') || 'Unable to build native RenderModel.');
  const buildModelMs=performance.now()-buildStarted;
  input.onProgress?.(35,'Rendering native PDF…');
  const renderStarted=performance.now();
  let pageCount=0;
  const output=await new PdfRenderer().render(nativeTemplate,built.model,{fileNamePrefix:input.fileName,options:{onDiagnostics:(d:any)=>{pageCount=Number(d.pageCount)||0;}}});
  const renderMs=performance.now()-renderStarted;
  input.onProgress?.(100,'PDF ready.');
  input.onTiming?.({buildModelMs,renderMs,totalMs:performance.now()-started,pageCount});
  return {bytes:output.content as Uint8Array,fileName:output.fileName,pageCount,warnings:built.warnings.map((w: { message:string })=>w.message)};
}

export async function renderNativeCombinedPdf(input:{
  savedTemplateRaw:string|null; source:BuilderDataSource; recordIndexes:number[]; fileName:string;
  onProgress?:(percent:number,message:string,current:number,total:number)=>void;
}){
  if(!input.recordIndexes.length) throw new Error('Select at least one document.');
  const total=input.recordIndexes.length;
  input.onProgress?.(2,'Preparing native template…',0,total);

  // Long-term bulk path: parse/convert the Builder template and load static assets
  // once for the entire batch. Only the lightweight DocumentGroup/RenderModel is
  // rebuilt per invoice. This intentionally avoids re-mounting React/Builder and
  // avoids re-reading logos/signatures for every record.
  const prepared=await prepareNativeTemplate(input.savedTemplateRaw,input.source);
  const engine=new TemplateEngine();
  const renderer=new CombinedPdfRenderer();
  const sources=input.recordIndexes.map((recordIndex,index)=>({
    documentGroupId:`${input.source.id}:${recordIndex}`,
    label:`Record ${recordIndex+1}`,
    resolve:async()=>{
      const group=buildNativeDocumentGroup(prepared,input.source,recordIndex);
      const nativeTemplate=await resolveNativeTemplateImages(prepared,group.header);
      const built=engine.buildRenderModel(nativeTemplate,group);
      if(!built.model) throw new Error(built.errors.map((e: { message:string })=>e.message).join(' ') || `Unable to build native RenderModel for record ${recordIndex+1}.`);
      input.onProgress?.(Math.max(3,Math.round((index/Math.max(1,total))*85)),`Prepared invoice ${index+1} of ${total}…`,index,total);
      return {template:nativeTemplate,model:built.model};
    },
  }));
  const output=await renderer.render(sources,{
    fileNamePrefix:input.fileName,totalDocumentsHint:total,pageNumbering:'PER_DOCUMENT',
    onProgress:(p: { percent:number; phase:string; currentDocument:number })=>input.onProgress?.(p.percent,p.phase==='FINALIZING'?'Finalizing combined PDF…':`Rendering invoice ${Math.max(1,p.currentDocument)} of ${total}…`,Math.max(0,p.currentDocument-1),total),
  });
  input.onProgress?.(100,'Combined PDF ready.',total,total);
  return {bytes:output.content as Uint8Array,fileName:output.fileName,pageCount:output.totalPages,documents:output.documents};
}

type PreparedNativeTemplate={
  template:TemplateDefinition;
  bodyElements:BuilderElement[];
  parentKeys:string[];
  imageBindings:Map<string,string>;
  imageFallbacks:Map<string,string>;
};

async function prepareNativeTemplate(raw:string|null, source:BuilderDataSource):Promise<PreparedNativeTemplate>{
  const saved=parseSaved(raw); if(!saved) throw new Error('Saved template is unavailable.');
  const compatibility=analyzeNativePdfCompatibility(raw,source);
  if(!compatibility.supported) throw new Error(`Fast / Native PDF is not available for this template yet: ${compatibility.reasons.join(' ')}`);
  const page=(saved.pages?.[0] ?? {id:'page-1',name:'Page 1',settings:defaultLegacySettings(saved),elements:saved.elements ?? []}) as BuilderPage;
  const all=page.elements ?? [];
  const formulaMap=new Map<string,string>(); const calculatedFields:CalculatedFieldDefinition[]=[];
  for(const element of all.filter((e)=>e.type==='formula')){
    const name=element.formulaName?.trim(); const expression=element.formulaExpression?.trim(); if(!name||!expression) continue;
    const alias=safeAlias(name); formulaMap.set(name.toLowerCase(),alias);
    const ids=[...expression.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m)=>m[1]!.trim());
    calculatedFields.push({id:element.id,name,alias,value:{operation:'FORMULA',expression,sourcePath:'items',formulaBindings:[...new Set(ids)].map((id)=>({id,label:id,path:id,sourceField:id,targetPath:id,sourcePath:'items'}))}});
  }
  const master=all.filter((e)=>e.type!=='formula');
  const headerElements=master.filter((e)=>(e.region??'body')==='header');
  const bodyElements=master.filter((e)=>(e.region??'body')==='body');
  const footerElements=master.filter((e)=>(e.region??'body')==='footer');
  const imageBindings=new Map<string,string>();
  const imageFallbacks=new Map<string,string>();
  for(const element of master){
    if((element.type==='image'||element.type==='signature') && element.binding){
      imageBindings.set(element.id,element.binding);
      if(element.imageSource) imageFallbacks.set(element.id,element.imageSource);
    }
  }
  const template:TemplateDefinition={
    id:`builder-native:${page.id}`,name:saved.name?.trim()||'Document',version:1,
    page:toPageDefinition(page.settings),
    header:{blocks:await convertRegion(headerElements,formulaMap)},
    body:{blocks:await convertBody(bodyElements,formulaMap)},
    footer:{blocks:await convertRegion(footerElements,formulaMap)},
    calculatedFields,
    metadata:{nativeAdapter:'DB-5F-v1',updatedAt:saved.updatedAt},
  };
  return {template,bodyElements,parentKeys:findParentKeys(bodyElements,source.id),imageBindings,imageFallbacks};
}

function buildNativeDocumentGroup(prepared:PreparedNativeTemplate, source:BuilderDataSource, recordIndex:number):DocumentGroup{
  const safeIndex=Math.max(0,Math.min(recordIndex,Math.max(0,source.records.length-1)));
  const selected=source.records[safeIndex] ?? {};
  const parentKeys=prepared.parentKeys;
  const matched=parentKeys.length
    ? source.records.map((row,index)=>({row,index})).filter(({row})=>parentKeys.every((key)=>displayValue(valueForField(row,key)).trim()===displayValue(valueForField(selected,key)).trim()))
    : [{row:selected,index:safeIndex}];
  const rows=matched.map((item)=>item.row);
  const indexes=matched.map((item)=>item.index);
  return {
    id:`${source.id}:${safeIndex}`,
    key:parentKeys.map((k)=>displayValue(valueForField(selected,k))).join('|')||String(safeIndex),
    header:selected,
    items:rows,
    sourceItems:rows,
    itemDetails:matched.map(({row,index})=>({data:row,sourceRowIndex:index})),
    sourceRowIndexes:indexes,
    warnings:[],
    valid:true,
  };
}

function parseSaved(raw:string|null):SavedBuilderTemplate|null{ if(!raw)return null; try{return JSON.parse(raw) as SavedBuilderTemplate;}catch{return null;} }
function defaultLegacySettings(saved:SavedBuilderTemplate):PageSettings{return {preset:(saved.pageSize as any)||'A4',orientation:(saved.orientation as any)||'Portrait',unit:'mm',customWidthMm:210,customHeightMm:297,marginsMm:{top:15,right:15,bottom:15,left:15},bleedMm:{top:0,right:0,bottom:0,left:0},safeAreaMm:5,background:'#ffffff',borderColor:'#d2d8e0',borderWidth:0,borderAlignment:'inside',borderOffsetMm:0,showGuides:false,header:{enabled:false,heightMm:20,gapMm:5,repeat:'every'},footer:{enabled:false,heightMm:15,gapMm:5,repeat:'every'}};}
function toPageDefinition(s:PageSettings):TemplateDefinition['page']{
  const preset=String(s.preset).toUpperCase(); const size=(preset==='LETTER'||preset==='LEGAL'||preset==='TABLOID'||preset==='EXECUTIVE'||/^A[0-9]+$/.test(preset))?preset:'CUSTOM';
  return {size:size as any,orientation:s.orientation==='Landscape'?'LANDSCAPE':'PORTRAIT',margins:{...s.marginsMm},customWidthMm:s.customWidthMm,customHeightMm:s.customHeightMm,backgroundColor:s.background,border:{enabled:s.borderWidth>0,style:'SOLID',width:s.borderWidth,color:s.borderColor,offset:s.borderOffsetMm},pagination:{repeatHeader:s.header.enabled,footerMode:s.footer.enabled?'REPEAT_PAGE':'FLOW',showPageNumbers:false,keepSummaryTogether:true}};
}
function findParentKeys(elements:BuilderElement[],sourceId:string){for(const e of elements){if(e.type==='table'&&e.table?.mode==='dynamic'&&(!e.table.binding?.sourceId||e.table.binding.sourceId===sourceId)){const keys=e.table.binding?.parentKeys?.filter(Boolean)??(e.table.binding?.parentKey?[e.table.binding.parentKey]:[]);if(keys.length)return keys;}}return [] as string[];}

async function convertBody(elements:BuilderElement[], formulaMap:Map<string,string>):Promise<TemplateBlock[]>{
  const sorted=[...elements].sort((a,b)=>a.y-b.y||a.x-b.x); const out:TemplateBlock[]=[]; const consumed=new Set<string>();
  for(const element of sorted){
    if(consumed.has(element.id)) continue;
    const rowId=element.flowRowId;
    const siblings=rowId?sorted.filter((e)=>e.flowRowId===rowId):[element];
    if(rowId&&siblings.length>1){
      siblings.forEach((e)=>consumed.add(e.id));
      const children=await Promise.all(siblings.sort((a,b)=>a.x-b.x).map((e)=>convertElement(e,formulaMap,true)));
      out.push({id:`row:${rowId}`,type:'ROW',children:children.filter(Boolean) as any[],gap:Math.max(...siblings.map((e)=>e.flowColumnGapMm??2)),verticalAlignment:'TOP',layout:{widthPercent:100,marginTop:Math.min(...siblings.map((e)=>e.flowGapBeforeMm??0)),marginBottom:Math.max(...siblings.map((e)=>e.flowGapAfterMm??0))}});
    }else{
      consumed.add(element.id); const block=await convertElement(element,formulaMap,false); if(block)out.push(block);
    }
  }
  return out;
}
async function convertRegion(elements:BuilderElement[],formulaMap:Map<string,string>):Promise<TemplateBlock[]>{
  const sorted=[...elements].sort((a,b)=>a.y-b.y||a.x-b.x); const out:TemplateBlock[]=[]; let previousBottom:number|null=null;
  for(const element of sorted){const block=await convertElement(element,formulaMap,false);if(!block)continue;const gap=previousBottom==null?0:Math.max(0,pxToMm(element.y-previousBottom));block.layout={...(block.layout??{}),marginTop:gap};out.push(block);previousBottom=Math.max(element.y+element.height,previousBottom??0);}return out;
}
async function convertElement(element:BuilderElement,formulaMap:Map<string,string>,inRow:boolean):Promise<TemplateBlock|null>{
  const layout={widthPercent:inRow?100:Math.max(1,Math.min(100,element.flowWidthPercent??100)),alignment:alignment(element.textAlign),marginTop:element.flowGapBeforeMm??0,marginBottom:element.flowGapAfterMm??0,keepTogether:element.type!=='table'} as any;
  const style:TextStyle={fontFamily:(element.fontFamily as any)||'Arial',fontSize:Math.max(6,element.fontSize||11),bold:(element.fontWeight??400)>=600,italic:!!element.italic,underline:!!element.underline,textColor:element.color||'#111827',backgroundColor:element.fill&&element.fill!=='transparent'?element.fill:undefined,alignment:alignment(element.textAlign),lineHeight:element.lineHeight};
  if(element.type==='text'){
    const binding=rewriteFormulaPath(element.binding,formulaMap); if(binding)return {id:element.id,type:'FIELD',path:binding,valueStyle:style,textAlignment:alignment(element.textAlign),layout};
    return {id:element.id,type:'TEXT',text:rewriteFormulaTokens(element.text??'',formulaMap),style,layout};
  }
  if(element.type==='divider')return {id:element.id,type:'DIVIDER',thickness:Math.max(.2,pxToMm(Math.max(1,element.height))),color:element.color||'#94A3B8',style:'SOLID',layout};
  if(element.type==='shape'){
    const child=element.binding
      ? {id:`${element.id}:value`,type:'FIELD' as const,path:rewriteFormulaPath(element.binding,formulaMap)!,valueStyle:style,textAlignment:alignment(element.textAlign)}
      : {id:`${element.id}:text`,type:'TEXT' as const,text:rewriteFormulaTokens(element.text??'',formulaMap),style};
    return {id:element.id,type:'BOX',style:{widthMode:'PERCENT',widthPercent:layout.widthPercent,heightMode:'FIXED',heightMm:pxToMm(element.height),backgroundColor:element.fill||'#ffffff',border:{width:0,color:element.color||'#000000',style:'NONE'},padding:{top:1,right:1,bottom:1,left:1},horizontalAlignment:alignment(element.textAlign),verticalAlignment:'CENTER'},children:[child] as any,layout};
  }
  if(element.type==='image'||element.type==='signature'){
    let source=element.imageSource||'';
    if(!source&&element.imageAssetId){const blob=await loadImageAsset(element.imageAssetId);if(blob)source=await blobToDataUrl(blob);}
    if(source) source=await normalizeNativeImageSource(source);
    // A bound image is resolved per document immediately before TemplateEngine runs.
    // Keep a valid 1x1 placeholder in the shared prepared template so the block can
    // participate in layout even when a particular record has an empty image value.
    if(!source&&element.binding) source=EMPTY_JPEG_DATA_URL;
    if(!source)return null;
    return {id:element.id,type:'IMAGE',sourceType:'DATA_URL',source,altText:element.type==='signature'?'Signature':'Image',width:pxToMm(element.width),height:pxToMm(element.height),maintainAspectRatio:element.imageFit!=='fill',alignment:alignment(element.textAlign),layout};
  }
  if(element.type==='table'&&element.table)return convertTable(element,layout);
  return null;
}
function convertTable(element:BuilderElement,layout:any):TableBlock|CustomTableBlock{
  const t=element.table!; if(t.mode==='custom'){
    const rows=t.rows.length?t.rows:t.customRows; const cells:any[]=[];
    rows.forEach((row,rowIndex)=>{
      row.cells.forEach((cell,columnIndex)=>{
        cells.push({
          id:cell.id,row:rowIndex,column:columnIndex,rowSpan:cell.rowSpan||1,colSpan:cell.colSpan||1,
          content:cell.binding
            ? {type:'FIELD',path:cell.binding,style:cellTextStyle(cell.style)}
            : {type:'TEXT',text:cell.content||'',style:cellTextStyle(cell.style)},
          style:{
            backgroundColor:cell.style.background,
            border:{width:t.borderWidth,color:t.borderColor,style:borderStyle(t.borderStyle)},
            padding:{top:pxToMm(cell.style.padding),right:pxToMm(cell.style.padding),bottom:pxToMm(cell.style.padding),left:pxToMm(cell.style.padding)},
            verticalAlignment:cell.style.verticalAlign==='bottom'?'BOTTOM':cell.style.verticalAlign==='middle'?'CENTER':'TOP',
          },
        });
      });
    });
    return {id:element.id,type:'CUSTOM_TABLE',rowCount:rows.length,columnCount:t.columns.length,cells,tableStyle:{showBorder:t.borderStyle!=='none'&&t.borderWidth>0,widthPercent:layout.widthPercent,border:{width:t.borderWidth,color:t.borderColor,style:borderStyle(t.borderStyle)},cellPadding:{top:pxToMm(t.defaultPadding),right:pxToMm(t.defaultPadding),bottom:pxToMm(t.defaultPadding),left:pxToMm(t.defaultPadding)}},layout};
  }
  const body=t.bodyRows[0]; const header=t.headerRows[0]; const totalWidth=Math.max(1,t.columns.reduce((sum,c)=>sum+Math.max(1,c.width),0));
  const columns=t.columns.map((c,index)=>{const cell=body?.cells[index];const h=header?.cells[index];return {id:c.id,label:h?.content||c.label||c.key,path:cell?.binding||c.key,sourceField:cell?.binding||c.key,targetPath:cell?.binding||c.key,widthPercent:(Math.max(1,c.width)/totalWidth)*100,alignment:alignment(c.align),headerAlignment:alignment(h?.style.align||c.align),headerStyle:h?cellTextStyle(h.style):undefined,cellStyle:cell?cellTextStyle(cell.style):undefined,format:toDisplayFormat(c.dataType, c.format)};});
  const footerRows:TableFooterRowDefinition[]=t.customRows.map((row)=>({id:row.id,cells:row.cells.map((cell,index)=>({id:cell.id,columnId:t.columns[index]?.id,colspan:cell.colSpan||1,value:footerValue(cell),alignment:alignment(cell.style.align),style:cellTextStyle(cell.style)})),backgroundColor:row.cells[0]?.style.background}));
  return {id:element.id,type:'TABLE',sourcePath:'items',columns,footerRows,tableStyle:{showHeader:t.headerRows.length>0,showBorder:t.borderStyle!=='none'&&t.borderWidth>0,widthPercent:layout.widthPercent,border:{width:t.borderWidth,color:t.borderColor,style:borderStyle(t.borderStyle)},headerStyle:header?.cells[0]?cellTextStyle(header.cells[0].style):undefined,cellStyle:body?.cells[0]?cellTextStyle(body.cells[0].style):undefined,cellPadding:{top:pxToMm(t.defaultPadding),right:pxToMm(t.defaultPadding),bottom:pxToMm(t.defaultPadding),left:pxToMm(t.defaultPadding)}},layout:{...layout,keepTogether:false}};
}
function footerValue(cell:TableCell):any{if(cell.summaryMode==='aggregate'&&cell.aggregate)return {operation:cell.aggregate.operation.toUpperCase(),path:cell.aggregate.field,sourceField:cell.aggregate.field,targetPath:cell.aggregate.field,sourcePath:'items'};if(cell.valueMode==='binding'&&cell.binding)return {operation:'FIELD',path:cell.binding};return {operation:'STATIC',staticValue:cell.content||''};}
function cellTextStyle(s:TableCellStyle):TextStyle{return {fontSize:s.fontSize,bold:s.bold,textColor:s.color,backgroundColor:s.background,alignment:alignment(s.align)};}
function borderStyle(s?:string):'NONE'|'SOLID'|'DASHED'{return s==='none'?'NONE':s==='dashed'||s==='dotted'?'DASHED':'SOLID';}
function toDisplayFormat(type?:TableDataType,format?:TableDataFormat):DisplayFormatDefinition|undefined{if(!type||type==='text')return undefined;if(type==='number'||type==='decimal')return {type:'NUMBER',decimals:type==='number'?0:(format?.decimals??2),useGrouping:format?.thousandsSeparator!==false};if(type==='currency')return {type:'CURRENCY',decimals:format?.decimals??2,useGrouping:format?.thousandsSeparator!==false,currencyCode:format?.currencyCode,currencySymbol:format?.currencySymbol};if(type==='percentage')return {type:'PERCENT',decimals:format?.decimals??2,percentInputMode:format?.percentInputMode==='whole'?'WHOLE':'FRACTION'};if(type==='date')return {type:'DATE',dateStyle:'SHORT'};if(type==='datetime')return {type:'DATETIME',dateStyle:'SHORT'};if(type==='checkbox')return {type:'BOOLEAN',trueLabel:format?.trueValue,falseLabel:format?.falseValue};return undefined;}
function rewriteFormulaTokens(text:string,map:Map<string,string>){return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(full,name:string)=>{const alias=map.get(name.trim().toLowerCase());return alias?`{{calc.${alias}}}`:full;});}
function rewriteFormulaPath(path:string|undefined,map:Map<string,string>){if(!path)return path;const alias=map.get(path.trim().toLowerCase());return alias?`calc.${alias}`:path;}
async function blobToDataUrl(blob:Blob):Promise<string>{return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error??new Error('Unable to read image asset.'));reader.readAsDataURL(blob);});}


const EMPTY_JPEG_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooA//2Q==';
const nativeImageCache = new Map<string, Promise<string>>();

async function normalizeNativeImageSource(raw:string):Promise<string>{
  const source=String(raw??'').trim();
  if(!source) return '';
  if(/^data:image\/(?:png|jpe?g|webp);base64,/i.test(source)) return source.replace(/^data:image\/jpg;/i,'data:image/jpeg;');
  if(/^(?:https?:|blob:)/i.test(source)){
    let pending=nativeImageCache.get(source);
    if(!pending){
      pending=(async()=>{const response=await fetch(source);if(!response.ok)throw new Error(`Unable to load image (${response.status}).`);return blobToDataUrl(await response.blob());})();
      nativeImageCache.set(source,pending);
    }
    try{return await pending;}catch{nativeImageCache.delete(source);return '';}
  }
  // Imported CSV/Excel may contain raw base64 without a data: prefix.
  // Browsers inspect the bytes during decode, so PNG is a safe generic wrapper.
  if(/^[A-Za-z0-9+/=\s]{128,}$/.test(source)) return `data:image/png;base64,${source.replace(/\s+/g,'')}`;
  return '';
}

async function resolveNativeTemplateImages(prepared:PreparedNativeTemplate,record:Record<string,unknown>):Promise<TemplateDefinition>{
  if(!prepared.imageBindings.size) return prepared.template;
  const resolved=new Map<string,string>();
  for(const [blockId,path] of prepared.imageBindings){
    const bound=valueForField(record,path);
    const candidate=typeof bound==='string'&&bound.trim()?bound:prepared.imageFallbacks.get(blockId)??'';
    resolved.set(blockId,(await normalizeNativeImageSource(candidate))||EMPTY_JPEG_DATA_URL);
  }
  const replace=(blocks:TemplateBlock[]):TemplateBlock[]=>blocks.map((block:any)=>{
    if(block.type==='IMAGE'&&resolved.has(block.id)) return {...block,sourceType:'DATA_URL',source:resolved.get(block.id)!};
    if(block.type==='ROW') return {...block,children:replace(block.children??[])};
    if(block.type==='BOX') return {...block,children:replace(block.children??[])};
    return block;
  });
  return {...prepared.template,header:{...prepared.template.header,blocks:replace(prepared.template.header?.blocks??[])},body:{...prepared.template.body,blocks:replace(prepared.template.body?.blocks??[])},footer:{...prepared.template.footer,blocks:replace(prepared.template.footer?.blocks??[])}};
}
