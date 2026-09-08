export type BackgroundRemovalMode = 'AUTO' | 'COLOR';

export interface BackgroundRemovalColor { r:number; g:number; b:number; }

export interface BackgroundRemovalSettings {
  mode: BackgroundRemovalMode;
  tolerance: number; // 0..100
  backgroundColor?: BackgroundRemovalColor;
}

export interface BackgroundRemovalRefinementSettings {
  edgeSoftness?: number; // 0..100
  feather?: number; // 0..100
  fringeCleanup?: number; // 0..100
  noiseCleanup?: number; // 0..100
}

export interface BackgroundRemovalBrushEdit {
  mode:'ERASE'|'RESTORE';
  x:number; // normalized 0..1
  y:number; // normalized 0..1
  radius:number; // normalized to max(width,height), clamped 0..1
  softness?:number; // 0..100
}

export interface BackgroundRemovalPipelineSettings extends BackgroundRemovalSettings, BackgroundRemovalRefinementSettings {
  brushEdits?: BackgroundRemovalBrushEdit[];
}

export interface RgbaImageDataLike {
  width:number;
  height:number;
  data:Uint8ClampedArray;
}

export interface BackgroundRemovalResult {
  image:RgbaImageDataLike;
  backgroundColor:BackgroundRemovalColor;
  removedPixels:number;
  totalPixels:number;
}

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const colorDistance=(r:number,g:number,b:number,c:BackgroundRemovalColor)=>Math.hypot(r-c.r,g-c.g,b-c.b);
const MAX_COLOR_DISTANCE=Math.hypot(255,255,255);

function dominantBorderColor(image:RgbaImageDataLike):BackgroundRemovalColor {
  const {width,height,data}=image;
  if(width<=0||height<=0)return {r:255,g:255,b:255};
  const buckets=new Map<string,{count:number,r:number,g:number,b:number}>();
  const add=(x:number,y:number)=>{
    const i=(y*width+x)*4;
    if((data[i+3]??0)===0)return;
    const r=data[i]??0,g=data[i+1]??0,b=data[i+2]??0;
    const key=`${Math.round(r/16)}:${Math.round(g/16)}:${Math.round(b/16)}`;
    const bucket=buckets.get(key)??{count:0,r:0,g:0,b:0};
    bucket.count++;bucket.r+=r;bucket.g+=g;bucket.b+=b;buckets.set(key,bucket);
  };
  for(let x=0;x<width;x++){add(x,0);if(height>1)add(x,height-1);}
  for(let y=1;y<height-1;y++){add(0,y);if(width>1)add(width-1,y);}
  const best=[...buckets.values()].sort((a,b)=>b.count-a.count)[0];
  if(!best)return {r:255,g:255,b:255};
  return {r:Math.round(best.r/best.count),g:Math.round(best.g/best.count),b:Math.round(best.b/best.count)};
}

export function resolveBackgroundRemovalColor(image:RgbaImageDataLike,settings:BackgroundRemovalSettings):BackgroundRemovalColor {
  if(settings.mode==='COLOR'&&settings.backgroundColor)return {
    r:clamp(Math.round(settings.backgroundColor.r),0,255),
    g:clamp(Math.round(settings.backgroundColor.g),0,255),
    b:clamp(Math.round(settings.backgroundColor.b),0,255),
  };
  return dominantBorderColor(image);
}

/**
 * Removes only pixels connected to an outer image edge. This intentionally preserves
 * matching colors inside the foreground (for example white petals on a white backdrop).
 */
export function removeConnectedImageBackground(image:RgbaImageDataLike,settings:BackgroundRemovalSettings):BackgroundRemovalResult {
  const {width,height}=image;
  const source=image.data;
  const out=new Uint8ClampedArray(source);
  if(width<=0||height<=0||source.length<width*height*4){
    return {image:{width,height,data:out},backgroundColor:{r:255,g:255,b:255},removedPixels:0,totalPixels:Math.max(0,width*height)};
  }
  const backgroundColor=resolveBackgroundRemovalColor(image,settings);
  const tolerance=clamp(Number.isFinite(settings.tolerance)?settings.tolerance:28,0,100);
  const threshold=(tolerance/100)*441.67295593;
  const visited=new Uint8Array(width*height);
  const queue=new Int32Array(width*height);
  let head=0,tail=0,removed=0;
  let opaquePixels=0;
  for(let pixel=0;pixel<width*height;pixel++)if((source[pixel*4+3]??0)>0)opaquePixels++;
  const matches=(pixel:number)=>{
    const i=pixel*4;
    const alpha=source[i+3]??0;
    if(alpha===0)return true;
    return colorDistance(source[i]??0,source[i+1]??0,source[i+2]??0,backgroundColor)<=threshold;
  };
  const enqueue=(pixel:number)=>{if(visited[pixel]||!matches(pixel))return;visited[pixel]=1;queue[tail++]=pixel;};
  for(let x=0;x<width;x++){enqueue(x);if(height>1)enqueue((height-1)*width+x);}
  for(let y=1;y<height-1;y++){enqueue(y*width);if(width>1)enqueue(y*width+width-1);}
  while(head<tail){
    const pixel=queue[head++]!;
    const x=pixel%width,y=Math.floor(pixel/width),i=pixel*4;
    if((out[i+3]??0)!==0){out[i+3]=0;removed++;}
    if(x>0)enqueue(pixel-1);
    if(x+1<width)enqueue(pixel+1);
    if(y>0)enqueue(pixel-width);
    if(y+1<height)enqueue(pixel+width);
  }
  // Safety guard for AUTO mode: a nearly uniform/no-background image should not be destroyed.
  if(settings.mode==='AUTO'&&opaquePixels>0&&removed/opaquePixels>=0.985){
    return {image:{width,height,data:new Uint8ClampedArray(source)},backgroundColor,removedPixels:0,totalPixels:width*height};
  }
  return {image:{width,height,data:out},backgroundColor,removedPixels:removed,totalPixels:width*height};
}

function collectOpaqueNeighborAverage(data:Uint8ClampedArray,width:number,height:number,x:number,y:number){
  let count=0,r=0,g=0,b=0;
  for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
    if(ox===0&&oy===0)continue;
    const nx=x+ox,ny=y+oy;
    if(nx<0||ny<0||nx>=width||ny>=height)continue;
    const i=(ny*width+nx)*4;
    const alpha=data[i+3]??0;
    if(alpha<=24)continue;
    r+=data[i]??0;g+=data[i+1]??0;b+=data[i+2]??0;count++;
  }
  return count>0?{r:r/count,g:g/count,b:b/count}:null;
}

function isEdgeAlpha(alpha:Uint8ClampedArray,width:number,height:number,x:number,y:number){
  const pixel=y*width+x;
  if((alpha[pixel]??0)===0)return false;
  if(x===0||y===0||x===width-1||y===height-1)return true;
  return (alpha[pixel-1]??0)===0||(alpha[pixel+1]??0)===0||(alpha[pixel-width]??0)===0||(alpha[pixel+width]??0)===0;
}

function extractAlpha(data:Uint8ClampedArray,width:number,height:number){
  const alpha=new Uint8ClampedArray(width*height);
  for(let pixel=0;pixel<width*height;pixel++)alpha[pixel]=data[pixel*4+3]??0;
  return alpha;
}

function applyAlphaChannel(data:Uint8ClampedArray,alpha:Uint8ClampedArray,width:number,height:number){
  for(let pixel=0;pixel<width*height;pixel++)data[pixel*4+3]=alpha[pixel]??0;
}

function blurAlpha(alpha:Uint8ClampedArray,width:number,height:number,radius:number){
  if(radius<=0)return new Uint8ClampedArray(alpha);
  const temp=new Float32Array(width*height);
  const out=new Uint8ClampedArray(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let sum=0,count=0;
    for(let ox=-radius;ox<=radius;ox++){
      const nx=x+ox;
      if(nx<0||nx>=width)continue;
      sum+=alpha[y*width+nx]??0;count++;
    }
    temp[y*width+x]=count>0?sum/count:0;
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let sum=0,count=0;
    for(let oy=-radius;oy<=radius;oy++){
      const ny=y+oy;
      if(ny<0||ny>=height)continue;
      sum+=temp[ny*width+x]??0;count++;
    }
    out[y*width+x]=Math.round(count>0?sum/count:0);
  }
  return out;
}

function cleanupAlpha(alpha:Uint8ClampedArray,width:number,height:number,strength:number){
  if(strength<=0)return new Uint8ClampedArray(alpha);
  let working=new Uint8ClampedArray(alpha);
  const passes=strength>=66?2:1;
  for(let pass=0;pass<passes;pass++){
    const next=new Uint8ClampedArray(working);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const pixel=y*width+x;
      const current=working[pixel]??0;
      let opaqueNeighbors=0;
      let transparentNeighbors=0;
      for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
        if(ox===0&&oy===0)continue;
        const nx=x+ox,ny=y+oy;
        if(nx<0||ny<0||nx>=width||ny>=height){transparentNeighbors++;continue;}
        if((working[ny*width+nx]??0)>127)opaqueNeighbors++; else transparentNeighbors++;
      }
      if(current>127&&opaqueNeighbors<=1)next[pixel]=0;
      else if(current===0&&opaqueNeighbors>=7)next[pixel]=255;
      else if(current>0&&current<=127&&transparentNeighbors>=7)next[pixel]=0;
    }
    working=next;
  }
  return working;
}

function hasTransparentNeighborWithin(alpha:Uint8ClampedArray,width:number,height:number,x:number,y:number,radius:number){
  for(let oy=-radius;oy<=radius;oy++)for(let ox=-radius;ox<=radius;ox++){
    if(ox===0&&oy===0)continue;
    const nx=x+ox,ny=y+oy;
    if(nx<0||ny<0||nx>=width||ny>=height)return true;
    if((alpha[ny*width+nx]??0)===0)return true;
  }
  return false;
}

/**
 * Converts hard keep/remove edges into a color-aware alpha ramp. Only pixels close to
 * already-transparent background are adjusted, so disconnected internal light details
 * remain protected by the connected-background contract from IMG1.
 */
function softenAndFeatherEdges(data:Uint8ClampedArray,source:RgbaImageDataLike,backgroundColor:BackgroundRemovalColor,settings:BackgroundRemovalPipelineSettings,width:number,height:number){
  const feather=clamp(Number.isFinite(settings.feather)?settings.feather!:0,0,100);
  const edgeSoftness=clamp(Number.isFinite(settings.edgeSoftness)?settings.edgeSoftness!:0,0,100);
  if(feather<=0&&edgeSoftness<=0)return extractAlpha(data,width,height);
  let alpha=extractAlpha(data,width,height);

  // Adaptive color fade first: create partial alpha for background-contaminated pixels
  // sitting immediately next to the removed region. Tolerance defines the hard-remove
  // threshold; Edge Softness defines how wide the fade band extends beyond it.
  if(edgeSoftness>0){
    const originalAlpha=new Uint8ClampedArray(alpha);
    const tolerance=clamp(Number.isFinite(settings.tolerance)?settings.tolerance:28,0,100);
    const hardThreshold=(tolerance/100)*MAX_COLOR_DISTANCE;
    const fadeBand=MAX_COLOR_DISTANCE*(0.035+(edgeSoftness/100)*0.38);
    const neighborRadius=1+Math.floor(edgeSoftness/34);
    const strength=0.35+(edgeSoftness/100)*0.65;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const pixel=y*width+x;
      const current=originalAlpha[pixel]??0;
      if(current===0||!hasTransparentNeighborWithin(originalAlpha,width,height,x,y,neighborRadius))continue;
      const i=pixel*4;
      const dist=colorDistance(source.data[i]??0,source.data[i+1]??0,source.data[i+2]??0,backgroundColor);
      if(dist>=hardThreshold+fadeBand)continue;
      const ramp=clamp((dist-hardThreshold)/Math.max(1,fadeBand),0,1);
      const targetAlpha=Math.round(current*ramp);
      alpha[pixel]=Math.round(current*(1-strength)+targetAlpha*strength);
    }
  }

  // Feather spatially smooths the adaptive alpha edge. Keep the mix bounded so the
  // subject does not become globally blurry even at high settings.
  if(feather>0){
    const blurred=blurAlpha(alpha,width,height,1+Math.floor(feather/30));
    const mix=Math.min(.72,0.12+(feather/100)*0.60);
    const edgeRadius=1+Math.floor(feather/30);
    const before=new Uint8ClampedArray(alpha);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const pixel=y*width+x;
      if(!hasTransparentNeighborWithin(before,width,height,x,y,edgeRadius)&&(before[pixel]??0)===255)continue;
      alpha[pixel]=Math.round((before[pixel]??0)*(1-mix)+(blurred[pixel]??0)*mix);
    }
  }
  return alpha;
}

/**
 * Removes background-color contamination from semi-transparent edge pixels. For partial
 * alpha we use the standard matte-unmix equation C = aF + (1-a)B to estimate foreground
 * color F. Opaque edge pixels fall back to neighboring subject-color averaging.
 */
function cleanupFringeColors(data:Uint8ClampedArray,backgroundColor:BackgroundRemovalColor,strength:number,width:number,height:number){
  if(strength<=0)return;
  const strength01=clamp(strength,0,100)/100;
  const alpha=extractAlpha(data,width,height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const pixel=y*width+x;
    const aByte=alpha[pixel]??0;
    if(aByte===0)continue;
    if(aByte===255&&!isEdgeAlpha(alpha,width,height,x,y))continue;
    const i=pixel*4;
    const a=aByte/255;
    if(a>0.06&&a<0.995){
      const inv=1-a;
      const unmatte=(channel:number,bg:number)=>clamp((channel-inv*bg)/a,0,255);
      const r=unmatte(data[i]??0,backgroundColor.r);
      const g=unmatte(data[i+1]??0,backgroundColor.g);
      const b=unmatte(data[i+2]??0,backgroundColor.b);
      const mix=Math.min(.95,strength01*(0.45+inv*0.75));
      data[i]=Math.round((data[i]??0)*(1-mix)+r*mix);
      data[i+1]=Math.round((data[i+1]??0)*(1-mix)+g*mix);
      data[i+2]=Math.round((data[i+2]??0)*(1-mix)+b*mix);
      continue;
    }
    const avg=collectOpaqueNeighborAverage(data,width,height,x,y);
    if(!avg)continue;
    const closeness=1-Math.min(1,colorDistance(data[i]??0,data[i+1]??0,data[i+2]??0,backgroundColor)/MAX_COLOR_DISTANCE);
    const mix=Math.min(.80,strength01*(0.25+closeness*0.45));
    data[i]=Math.round((data[i]??0)*(1-mix)+avg.r*mix);
    data[i+1]=Math.round((data[i+1]??0)*(1-mix)+avg.g*mix);
    data[i+2]=Math.round((data[i+2]??0)*(1-mix)+avg.b*mix);
  }
}

function applyBrushEdits(data:Uint8ClampedArray,source:RgbaImageDataLike,edits:BackgroundRemovalBrushEdit[]|undefined,width:number,height:number){
  if(!edits?.length)return;
  const maxDim=Math.max(1,Math.max(width,height));
  for(const edit of edits){
    const cx=clamp(edit.x,0,1)*(width-1);
    const cy=clamp(edit.y,0,1)*(height-1);
    const radius=Math.max(.5,clamp(edit.radius,0,1)*maxDim);
    const softness=clamp(Number.isFinite(edit.softness)?edit.softness!:60,0,100)/100;
    const innerRadius=radius*(1-softness*.85);
    const minX=Math.max(0,Math.floor(cx-radius-1)),maxX=Math.min(width-1,Math.ceil(cx+radius+1));
    const minY=Math.max(0,Math.floor(cy-radius-1)),maxY=Math.min(height-1,Math.ceil(cy+radius+1));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const dx=x-cx,dy=y-cy,dist=Math.hypot(dx,dy);
      if(dist>radius)continue;
      const falloff=dist<=innerRadius?1:1-((dist-innerRadius)/Math.max(.0001,radius-innerRadius));
      const strength=clamp(falloff,0,1);
      const i=(y*width+x)*4;
      const currentAlpha=data[i+3]??0;
      const sourceAlpha=source.data[i+3]??255;
      if(edit.mode==='ERASE'){
        data[i+3]=Math.round(currentAlpha*(1-strength));
      }else{
        data[i]=Math.round((data[i]??0)*(1-strength)+(source.data[i]??0)*strength);
        data[i+1]=Math.round((data[i+1]??0)*(1-strength)+(source.data[i+1]??0)*strength);
        data[i+2]=Math.round((data[i+2]??0)*(1-strength)+(source.data[i+2]??0)*strength);
        data[i+3]=Math.round(currentAlpha*(1-strength)+sourceAlpha*strength);
      }
    }
  }
}

export function refineBackgroundRemovalResult(source:RgbaImageDataLike,base:BackgroundRemovalResult,settings:BackgroundRemovalPipelineSettings):BackgroundRemovalResult {
  const {width,height}=base.image;
  const data=new Uint8ClampedArray(base.image.data);
  const noiseCleanup=clamp(Number.isFinite(settings.noiseCleanup)?settings.noiseCleanup!:0,0,100);
  let alpha=extractAlpha(data,width,height);
  if(noiseCleanup>0)alpha=cleanupAlpha(alpha,width,height,noiseCleanup);
  applyAlphaChannel(data,alpha,width,height);
  alpha=softenAndFeatherEdges(data,source,base.backgroundColor,settings,width,height);
  applyAlphaChannel(data,alpha,width,height);
  cleanupFringeColors(data,base.backgroundColor,clamp(Number.isFinite(settings.fringeCleanup)?settings.fringeCleanup!:0,0,100),width,height);
  applyBrushEdits(data,source,settings.brushEdits,width,height);
  let removedPixels=0;
  for(let pixel=0;pixel<width*height;pixel++)if((data[pixel*4+3]??0)===0)removedPixels++;
  return {image:{width,height,data},backgroundColor:base.backgroundColor,removedPixels,totalPixels:base.totalPixels};
}

export function runImageBackgroundRemovalPipeline(image:RgbaImageDataLike,settings:BackgroundRemovalPipelineSettings):BackgroundRemovalResult {
  const base=removeConnectedImageBackground(image,settings);
  const hasRefinement=(settings.edgeSoftness??0)>0||(settings.feather??0)>0||(settings.fringeCleanup??0)>0||(settings.noiseCleanup??0)>0||(settings.brushEdits?.length??0)>0;
  return hasRefinement?refineBackgroundRemovalResult(image,base,settings):base;
}

import type { AssetReference, DesignTemplate } from '@document-tool/contracts';

export function createBackgroundRemovedAsset(
  sourceAsset:AssetReference,
  resultSource:string,
  settings:BackgroundRemovalPipelineSettings,
  id:string,
  appliedAt=new Date().toISOString(),
):AssetReference {
  const originalAssetId=typeof sourceAsset.metadata?.backgroundRemovalOriginalAssetId==='string'
    ? sourceAsset.metadata.backgroundRemovalOriginalAssetId
    : sourceAsset.id;
  return {
    id,
    name:`${sourceAsset.name} · Background Removed`,
    kind:'IMAGE',
    sourceType:'DATA_URL',
    source:resultSource,
    mimeType:'image/png',
    widthPx:sourceAsset.widthPx,
    heightPx:sourceAsset.heightPx,
    metadata:{
      ...sourceAsset.metadata,
      backgroundRemovalDerived:true,
      backgroundRemovalOriginalAssetId:originalAssetId,
      backgroundRemovalSourceAssetId:sourceAsset.id,
      backgroundRemovalSettings:{...settings},
      backgroundRemovalAppliedAt:appliedAt,
    },
  };
}

export function applyBackgroundRemovedAssetToImage(template:DesignTemplate,artboardId:string,elementId:string,derivedAsset:AssetReference):DesignTemplate {
  const sharedAssets=template.sharedAssets.some(asset=>asset.id===derivedAsset.id)
    ? template.sharedAssets.map(asset=>asset.id===derivedAsset.id?derivedAsset:asset)
    : [...template.sharedAssets,derivedAsset];
  return {...template,sharedAssets,artboards:template.artboards.map(artboard=>artboard.id!==artboardId?artboard:{...artboard,elements:artboard.elements.map(element=>element.id===elementId&&element.type==='IMAGE'?{...element,assetId:derivedAsset.id}:element)})};
}

export function resetImageBackgroundRemoval(template:DesignTemplate,artboardId:string,elementId:string):DesignTemplate {
  const artboard=template.artboards.find(item=>item.id===artboardId);
  const element=artboard?.elements.find(item=>item.id===elementId);
  if(!element||element.type!=='IMAGE')return template;
  const asset=template.sharedAssets.find(item=>item.id===element.assetId);
  const originalAssetId=typeof asset?.metadata?.backgroundRemovalOriginalAssetId==='string'?asset.metadata.backgroundRemovalOriginalAssetId:null;
  if(!originalAssetId||!template.sharedAssets.some(item=>item.id===originalAssetId))return template;
  return {...template,artboards:template.artboards.map(item=>item.id!==artboardId?item:{...item,elements:item.elements.map(candidate=>candidate.id===elementId&&candidate.type==='IMAGE'?{...candidate,assetId:originalAssetId}:candidate)})};
}

export function applyBackgroundRemovedAssetToImageFill(template:DesignTemplate,artboardId:string,elementId:string,derivedAsset:AssetReference):DesignTemplate {
  const sharedAssets=template.sharedAssets.some(asset=>asset.id===derivedAsset.id)
    ? template.sharedAssets.map(asset=>asset.id===derivedAsset.id?derivedAsset:asset)
    : [...template.sharedAssets,derivedAsset];
  return {
    ...template,
    sharedAssets,
    artboards:template.artboards.map(artboard=>artboard.id!==artboardId?artboard:{
      ...artboard,
      elements:artboard.elements.map(element=>{
        if(element.id!==elementId||(element.type!=='SHAPE'&&element.type!=='PATH')||element.fill.type!=='IMAGE')return element;
        return {...element,fill:{...element.fill,assetId:derivedAsset.id}};
      }),
    }),
  };
}

export function resetImageFillBackgroundRemoval(template:DesignTemplate,artboardId:string,elementId:string):DesignTemplate {
  const artboard=template.artboards.find(item=>item.id===artboardId);
  const element=artboard?.elements.find(item=>item.id===elementId);
  if(!element||(element.type!=='SHAPE'&&element.type!=='PATH'))return template;
  const fill=element.fill;
  if(fill.type!=='IMAGE')return template;
  const asset=template.sharedAssets.find(item=>item.id===fill.assetId);
  const originalAssetId=typeof asset?.metadata?.backgroundRemovalOriginalAssetId==='string'?asset.metadata.backgroundRemovalOriginalAssetId:null;
  if(!originalAssetId||!template.sharedAssets.some(item=>item.id===originalAssetId))return template;
  return {
    ...template,
    artboards:template.artboards.map(item=>item.id!==artboardId?item:{
      ...item,
      elements:item.elements.map(candidate=>{
        if(candidate.id!==elementId||(candidate.type!=='SHAPE'&&candidate.type!=='PATH')||candidate.fill.type!=='IMAGE')return candidate;
        return {...candidate,fill:{...candidate.fill,assetId:originalAssetId}};
      }),
    }),
  };
}
