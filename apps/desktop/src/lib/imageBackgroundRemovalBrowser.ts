import { runImageBackgroundRemovalPipeline, resolveRasterImageElementSource, resolveRasterImageFillSource, type BackgroundRemovalBrushEdit, type BackgroundRemovalColor, type BackgroundRemovalPipelineSettings } from '@document-tool/design-engine';
import type { Artboard, AssetReference, DesignElement } from '@document-tool/contracts';

export interface BrowserBackgroundRemovalResult {
  dataUrl:string;
  widthPx:number;
  heightPx:number;
  backgroundColor:BackgroundRemovalColor;
  removedPixels:number;
  totalPixels:number;
}

export type { BackgroundRemovalBrushEdit, BackgroundRemovalColor, BackgroundRemovalPipelineSettings };

function loadImage(source:string):Promise<HTMLImageElement>{
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error('Unable to decode this image.'));
    image.src=source;
  });
}

const PROCESS_CACHE_MAX=24;
const PROCESS_MAX_PIXELS=32_000_000;
const processCache=new Map<string,BrowserBackgroundRemovalResult>();

function stableSettingsKey(settings:BackgroundRemovalPipelineSettings){return JSON.stringify(settings,Object.keys(settings).sort());}
function cacheKey(source:string,settings:BackgroundRemovalPipelineSettings){let hash=2166136261;const text=source+'|'+stableSettingsKey(settings);for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return `bg-${(hash>>>0).toString(16)}`;}
function remember(key:string,value:BrowserBackgroundRemovalResult){processCache.delete(key);processCache.set(key,value);while(processCache.size>PROCESS_CACHE_MAX){const oldest=processCache.keys().next().value as string|undefined;if(!oldest)break;processCache.delete(oldest);}}
export function clearImageBackgroundRemovalCache(){processCache.clear();}

export async function processImageBackground(source:string,settings:BackgroundRemovalPipelineSettings,signal?:AbortSignal):Promise<BrowserBackgroundRemovalResult>{
  if(signal?.aborted)throw new DOMException('Background removal cancelled.','AbortError');
  const key=cacheKey(source,settings);const cached=processCache.get(key);if(cached){processCache.delete(key);processCache.set(key,cached);return cached;}
  const image=await loadImage(source);
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  if(!width||!height)throw new Error('Image dimensions are unavailable.');
  if(width*height>PROCESS_MAX_PIXELS)throw new Error(`Image is too large for safe background removal (${width}×${height}). Limit is ${PROCESS_MAX_PIXELS.toLocaleString()} pixels.`);
  if(signal?.aborted)throw new DOMException('Background removal cancelled.','AbortError');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw new Error('Image processing canvas is unavailable.');
  context.clearRect(0,0,width,height);context.drawImage(image,0,0,width,height);
  let pixels:ImageData;
  try{pixels=context.getImageData(0,0,width,height);}catch{throw new Error('This image source cannot be processed locally.');}
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  if(signal?.aborted)throw new DOMException('Background removal cancelled.','AbortError');
  const result=runImageBackgroundRemovalPipeline({width,height,data:pixels.data},settings);
  context.putImageData(new ImageData(result.image.data as any,width,height),0,0);
  const output={dataUrl:canvas.toDataURL('image/png'),widthPx:width,heightPx:height,backgroundColor:result.backgroundColor,removedPixels:result.removedPixels,totalPixels:result.totalPixels};
  remember(key,output);
  return output;
}

export async function sampleImageColor(source:string,normalizedX:number,normalizedY:number):Promise<BackgroundRemovalColor>{
  const image=await loadImage(source);const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw new Error('Image processing canvas is unavailable.');
  context.drawImage(image,0,0,width,height);
  const x=Math.min(width-1,Math.max(0,Math.floor(normalizedX*width))),y=Math.min(height-1,Math.max(0,Math.floor(normalizedY*height)));
  const p=context.getImageData(x,y,1,1).data;return {r:p[0]??0,g:p[1]??0,b:p[2]??0};
}


export const DYNAMIC_BG_REMOVAL_METADATA_KEY='dynamicBackgroundRemoval';
export const DYNAMIC_FILL_BG_REMOVAL_METADATA_KEY='dynamicFillBackgroundRemoval';

export interface DynamicBackgroundRemovalMetadata {
  enabled:boolean;
  settings:BackgroundRemovalPipelineSettings;
}

export function readDynamicBackgroundRemovalMetadata(element:DesignElement,fill=false):DynamicBackgroundRemovalMetadata|undefined{
  const key=fill?DYNAMIC_FILL_BG_REMOVAL_METADATA_KEY:DYNAMIC_BG_REMOVAL_METADATA_KEY;
  const raw=element.metadata?.[key];
  if(!raw||typeof raw!=='object')return undefined;
  const candidate=raw as Partial<DynamicBackgroundRemovalMetadata>;
  if(candidate.enabled!==true||!candidate.settings||typeof candidate.settings!=='object')return undefined;
  return {enabled:true,settings:candidate.settings as BackgroundRemovalPipelineSettings};
}

/** Processes only runtime dynamic sources created by resolveArtboardBindings(). */
export async function processDynamicBackgroundRemovalArtboard(artboard:Artboard,assets:readonly AssetReference[],signal?:AbortSignal):Promise<Artboard>{
  let changed=false;
  const elements=[] as DesignElement[];
  for(const element of artboard.elements){
    if(signal?.aborted)throw new DOMException('Background removal cancelled.','AbortError');
    let next:DesignElement=element;
    if(element.type==='IMAGE'){
      const meta=readDynamicBackgroundRemovalMetadata(element,false);
      const runtimeSource=(element as typeof element & {source?:unknown}).source;
      if(meta&&typeof runtimeSource==='string'&&runtimeSource.trim()){
        const result=await processImageBackground(resolveRasterImageElementSource(element,assets)??runtimeSource,meta.settings,signal);
        next={...element,source:result.dataUrl} as typeof element & {source:string};changed=true;
      }
    }else if((element.type==='SHAPE'||element.type==='PATH')&&element.fill.type==='IMAGE'){
      const meta=readDynamicBackgroundRemovalMetadata(element,true);
      const runtimeSource=(element.fill as typeof element.fill & {source?:unknown}).source;
      if(meta&&typeof runtimeSource==='string'&&runtimeSource.trim()){
        const result=await processImageBackground(resolveRasterImageFillSource(element.fill,assets)??runtimeSource,meta.settings,signal);
        next={...element,fill:{...element.fill,source:result.dataUrl}} as any;changed=true;
      }
    }
    elements.push(next);
  }
  return changed?{...artboard,elements}:artboard;
}
