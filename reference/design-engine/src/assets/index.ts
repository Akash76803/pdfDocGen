import type {AssetMetadata,AssetReference,DesignFill,DesignTemplate,ImageDesignElement,SvgDesignElement} from '@document-tool/contracts';

export const DEFAULT_SVG_WIDTH=300;
export const DEFAULT_SVG_HEIGHT=150;
export const DEFAULT_ASSET_MAX_BYTES=2*1024*1024;

export interface SvgValidationResult {valid:boolean;errors:string[];}
export interface NormalizedSvg {source:string;width:number;height:number;viewBox:string;aspectRatio:number;fallbackDimensions:boolean;recolorable:boolean;}
export interface PreparedAssetImport {asset:AssetReference;fingerprint:string;duplicate?:AssetReference;}
export interface PrepareAssetInput {id:string;name:string;fileName:string;mimeType:string;source:string;sizeBytes:number;widthPx?:number;heightPx?:number;importedAt?:string;existing?:readonly AssetReference[];maxBytes?:number;}

const unsafeElement=/<\s*(script|foreignObject|iframe|object|embed|link)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>|<\s*(script|foreignObject|iframe|object|embed|link)\b[^>]*\/?>/gi;
const eventAttribute=/\s+on[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const hrefAttribute=/\s+(?:href|xlink:href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const styleAttribute=/\s+style\s*=\s*("([^"]*)"|'([^']*)')/gi;

export function validateSvgSource(source:string):SvgValidationResult {
  const errors:string[]=[];
  if(!source.trim())errors.push('SVG_EMPTY');
  if(!/<svg\b/i.test(source)||!/<\/svg\s*>/i.test(source))errors.push('SVG_ROOT_INVALID');
  if(/<\s*parsererror\b/i.test(source))errors.push('SVG_XML_INVALID');
  return {valid:errors.length===0,errors};
}

export function sanitizeSvgSource(source:string):string {
  const validation=validateSvgSource(source);
  if(!validation.valid)throw new Error(validation.errors[0]);
  let sanitized=source.replace(/<\?xml[\s\S]*?\?>/gi,'').replace(/<!DOCTYPE[\s\S]*?>/gi,'').replace(unsafeElement,'').replace(eventAttribute,'');
  sanitized=sanitized.replace(hrefAttribute,(_match,_quoted,doubleValue,singleValue,bareValue)=>{const value=String(doubleValue??singleValue??bareValue??'').trim();return value.startsWith('#')?` href="${value}"`:'';});
  sanitized=sanitized.replace(styleAttribute,(_match,_quoted,doubleValue,singleValue)=>{const value=String(doubleValue??singleValue??'');if(/url\s*\(\s*(?!['"]?#)/i.test(value)||/@import|javascript\s*:/i.test(value))return '';return ` style="${value.replace(/"/g,'&quot;')}"`;});
  sanitized=sanitized.replace(/\s+(src|poster)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,'').replace(/javascript\s*:/gi,'');
  const result=validateSvgSource(sanitized);if(!result.valid)throw new Error(result.errors[0]);return sanitized.trim();
}

function lengthPx(value:string|undefined):number|undefined {if(!value)return;const match=value.trim().match(/^([0-9]*\.?[0-9]+)\s*(px|pt|pc|mm|cm|in)?$/i);if(!match)return;const number=Number(match[1]),unit=(match[2]??'px').toLowerCase(),factor:Record<string,number>={px:1,pt:96/72,pc:16,mm:96/25.4,cm:96/2.54,in:96};return number>0?number*factor[unit]!:undefined;}
function attribute(svg:string,name:string):string|undefined {return svg.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`,'i'))?.[1];}
function recolorable(svg:string):boolean {const colors=[...svg.matchAll(/\b(?:fill|stroke)\s*=\s*["']([^"']+)["']/gi)].map(match=>match[1]!.toLowerCase()).filter(value=>!['none','transparent','currentcolor'].includes(value)&&!value.startsWith('url('));return colors.length===0||new Set(colors).size===1;}

export function normalizeSvgSource(untrustedSource:string):NormalizedSvg {
  let source=sanitizeSvgSource(untrustedSource);const currentViewBox=attribute(source,'viewBox');const values=currentViewBox?.trim().split(/[\s,]+/).map(Number);const validViewBox=values?.length===4&&values.every(Number.isFinite)&&values[2]!>0&&values[3]!>0;
  let width=lengthPx(attribute(source,'width')),height=lengthPx(attribute(source,'height')),fallbackDimensions=false;
  if((!width||!height)&&validViewBox){width=width??values![2];height=height??values![3];}
  if(!width||!height){width=DEFAULT_SVG_WIDTH;height=DEFAULT_SVG_HEIGHT;fallbackDimensions=true;}
  const viewBox=validViewBox?values!.join(' '):`0 0 ${width} ${height}`;
  source=source.replace(/<svg\b([^>]*)>/i,(_match,attrs)=>{const clean=String(attrs).replace(/\s(?:width|height|viewBox|preserveAspectRatio)\s*=\s*(?:"[^"]*"|'[^']*')/gi,'');return `<svg${clean} viewBox="${viewBox}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet">`;});
  return {source,width,height,viewBox,aspectRatio:width/height,fallbackDimensions,recolorable:recolorable(source)};
}

export function fingerprintAssetContent(content:string):string {let hash=2166136261;for(let index=0;index<content.length;index++){hash^=content.charCodeAt(index);hash=Math.imul(hash,16777619);}return `fnv1a-${(hash>>>0).toString(16).padStart(8,'0')}`;}

export function prepareAssetImport(input:PrepareAssetInput):PreparedAssetImport {
  if(input.sizeBytes>(input.maxBytes??DEFAULT_ASSET_MAX_BYTES))throw new Error('ASSET_SIZE_LIMIT_EXCEEDED');
  const isSvg=input.mimeType==='image/svg+xml'||input.fileName.toLowerCase().endsWith('.svg');let source=input.source,width=input.widthPx,height=input.heightPx,extra:AssetMetadata={};
  if(isSvg){const raw=decodeSvgDataUrl(input.source);const normalized=normalizeSvgSource(raw);source=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(normalized.source)}`;width=normalized.width;height=normalized.height;extra={viewBox:normalized.viewBox,aspectRatio:normalized.aspectRatio,originalWidth:normalized.width,originalHeight:normalized.height,fallbackDimensions:normalized.fallbackDimensions,recolorable:normalized.recolorable,sanitized:true,normalized:true,format:'SVG'};}
  else extra={aspectRatio:width&&height?width/height:undefined,originalWidth:width,originalHeight:height,format:'RASTER'};
  const fingerprint=fingerprintAssetContent(source),duplicate=input.existing?.find(asset=>asset.metadata?.fingerprint===fingerprint);
  const asset:AssetReference={id:input.id,name:input.name,kind:isSvg?'SVG':'IMAGE',sourceType:'DATA_URL',source,mimeType:isSvg?'image/svg+xml':input.mimeType,widthPx:width,heightPx:height,metadata:{...extra,originalFileName:input.fileName,userUploaded:true,importedAt:input.importedAt??new Date().toISOString(),fingerprint}};
  return {asset:duplicate??asset,fingerprint,duplicate};
}

export function decodeSvgDataUrl(source:string):string {const comma=source.indexOf(',');if(comma<0)return source;const header=source.slice(0,comma);const data=source.slice(comma+1);if(/;base64/i.test(header)){const binary=globalThis.atob(data);return decodeURIComponent([...binary].map(char=>`%${char.charCodeAt(0).toString(16).padStart(2,'0')}`).join(''));}return decodeURIComponent(data);}

export function replaceElementAsset(template:DesignTemplate,artboardId:string,elementId:string,assetId:string):DesignTemplate {return {...template,artboards:template.artboards.map(artboard=>artboard.id===artboardId?{...artboard,elements:artboard.elements.map(element=>element.id===elementId&&(element.type==='IMAGE'||element.type==='SVG')?{...element,assetId} as ImageDesignElement|SvgDesignElement:element)}:artboard)};}

export function searchAssetCatalog(assets:readonly AssetReference[],query:string):AssetReference[]{const needle=query.trim().toLowerCase();if(!needle)return [...assets];return assets.filter(asset=>[asset.name,asset.metadata?.category,asset.metadata?.subcategory,asset.metadata?.folder,asset.metadata?.format,...(asset.metadata?.tags??[])].some(value=>String(value??'').toLowerCase().includes(needle)));}

export function assetRenderKind(asset:AssetReference|undefined):'VECTOR_SVG'|'RASTER_IMAGE'|'MISSING'|'UNSUPPORTED' {if(!asset)return'MISSING';if(asset.kind==='SVG'||asset.mimeType==='image/svg+xml')return'VECTOR_SVG';if(asset.kind==='IMAGE'&&asset.mimeType?.startsWith('image/'))return'RASTER_IMAGE';return'UNSUPPORTED';}


export function resolveRasterImageElementSource(element:ImageDesignElement,assets:readonly AssetReference[]):string|undefined {
  const runtimeSource=(element as ImageDesignElement & {source?:unknown}).source;
  if(typeof runtimeSource==='string'&&runtimeSource.trim()!=='')return runtimeSource.trim();
  const asset=assets.find(item=>item.id===element.assetId);
  return assetRenderKind(asset)==='RASTER_IMAGE'&&asset?.source?asset.source:undefined;
}

export function resolveRasterImageFillSource(fill:Extract<DesignFill,{type:'IMAGE'}>,assets:readonly AssetReference[]):string|undefined {
  const runtimeSource=(fill as Extract<DesignFill,{type:'IMAGE'}> & {source?:unknown}).source;
  if(typeof runtimeSource==='string'&&runtimeSource.trim()!=='')return runtimeSource.trim();
  const asset=assets.find(item=>item.id===fill.assetId);
  if(!asset?.source)return undefined;
  const mime=asset.mimeType?.toLowerCase();
  const isRasterMime=!!mime&&mime.startsWith('image/')&&mime!=='image/svg+xml';
  const isRasterKind=asset.kind==='IMAGE'||asset.kind==='LOGO';
  return isRasterMime||isRasterKind?asset.source:undefined;
}
