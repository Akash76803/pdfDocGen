import type {Artboard,ArtboardPrintSettings,ArtboardPrintValidationResult,AssetReference,DesignInsets,DesignPrintValidationResult,DesignTemplate,ImageDesignElement,PrintValidationIssue,RasterDpiResult} from '@document-tool/contracts';
import {assetRenderKind} from '../assets/index.js';

export const DEFAULT_PRINT_BLEED_MM=3;
export const DEFAULT_PRINT_SAFE_AREA_MM=3;
export const DEFAULT_MINIMUM_RASTER_DPI=150;
export const DEFAULT_PREFERRED_RASTER_DPI=300;
export interface ResolvedPrintSettings extends ArtboardPrintSettings {cropMarksEnabledForExport:boolean;showBleedInEditor:boolean;showSafeAreaInEditor:boolean;showCropMarksInEditor:boolean;minimumRasterDpi:number;preferredRasterDpi:number;}
const uniform=(value:number):DesignInsets=>({topMm:value,rightMm:value,bottomMm:value,leftMm:value});
export const STANDARD_PRINT_PRESET:ArtboardPrintSettings={bleed:uniform(3),safeArea:uniform(3),cropMarksEnabledForExport:false,showBleedInEditor:false,showSafeAreaInEditor:false,showCropMarksInEditor:false,minimumRasterDpi:150,preferredRasterDpi:300,profileId:'STANDARD_PRINT',profileVersion:1};
export const NO_BLEED_DIGITAL_PRESET:ArtboardPrintSettings={bleed:uniform(0),safeArea:uniform(0),cropMarksEnabledForExport:false,showBleedInEditor:false,showSafeAreaInEditor:false,showCropMarksInEditor:false,minimumRasterDpi:96,preferredRasterDpi:150,profileId:'NO_BLEED_DIGITAL',profileVersion:1};

export function resolvePrintSettings(settings?:Partial<ArtboardPrintSettings>):ResolvedPrintSettings {return {...STANDARD_PRINT_PRESET,...settings,bleed:{...STANDARD_PRINT_PRESET.bleed,...settings?.bleed},safeArea:{...STANDARD_PRINT_PRESET.safeArea,...settings?.safeArea},cropMarksEnabledForExport:settings?.cropMarksEnabledForExport??false,showBleedInEditor:settings?.showBleedInEditor??false,showSafeAreaInEditor:settings?.showSafeAreaInEditor??false,showCropMarksInEditor:settings?.showCropMarksInEditor??false,minimumRasterDpi:settings?.minimumRasterDpi??DEFAULT_MINIMUM_RASTER_DPI,preferredRasterDpi:settings?.preferredRasterDpi??DEFAULT_PREFERRED_RASTER_DPI};}
export const mmToInches=(mm:number)=>mm/25.4;
export const inchesToMm=(inches:number)=>inches*25.4;
export const requiredPixels=(mm:number,dpi:number)=>Math.round(mmToInches(Math.max(0,mm))*Math.max(0,dpi));
export function bleedExpandedDimensions(widthMm:number,heightMm:number,bleed:DesignInsets){return{widthMm:widthMm+bleed.leftMm+bleed.rightMm,heightMm:heightMm+bleed.topMm+bleed.bottomMm};}

export function calculateEffectiveRasterDpi(widthPx:number|undefined,heightPx:number|undefined,widthMm:number,heightMm:number,minimumDpi=DEFAULT_MINIMUM_RASTER_DPI,preferredDpi=DEFAULT_PREFERRED_RASTER_DPI):RasterDpiResult {
  if(!widthPx||!heightPx||widthPx<=0||heightPx<=0||widthMm<=0||heightMm<=0)return{status:'UNKNOWN',message:'Raster dimensions are unavailable.'};
  const dpiX=widthPx/mmToInches(widthMm),dpiY=heightPx/mmToInches(heightMm),effectiveDpi=Math.min(dpiX,dpiY);
  if(effectiveDpi>=preferredDpi)return{dpiX,dpiY,effectiveDpi,status:'GOOD',message:'Print Ready'};
  if(effectiveDpi>=minimumDpi)return{dpiX,dpiY,effectiveDpi,status:'WARNING',message:'Usable with reduced print quality'};
  return{dpiX,dpiY,effectiveDpi,status:'LOW',message:'Low Resolution'};
}

export function imagePrintQuality(element:ImageDesignElement,asset:AssetReference|undefined,settings?:Partial<ArtboardPrintSettings>):RasterDpiResult {const resolved=resolvePrintSettings(settings);if(assetRenderKind(asset)!=='RASTER_IMAGE')return{status:assetRenderKind(asset)==='VECTOR_SVG'?'VECTOR':'UNKNOWN',message:asset?'Unsupported Asset':'Missing Asset'};return calculateEffectiveRasterDpi(asset?.widthPx,asset?.heightPx,element.size.widthMm,element.size.heightMm,resolved.minimumRasterDpi,resolved.preferredRasterDpi);}

export function updateArtboardPrintSettings(template:DesignTemplate,artboardId:string,patch:Partial<ArtboardPrintSettings>):DesignTemplate {return{...template,artboards:template.artboards.map(artboard=>{if(artboard.id!==artboardId)return artboard;const current=resolvePrintSettings(artboard.print);return{...artboard,print:resolvePrintSettings({...current,...patch,bleed:patch.bleed?{...current.bleed,...patch.bleed}:current.bleed,safeArea:patch.safeArea?{...current.safeArea,...patch.safeArea}:current.safeArea})};})};}
export function applyPrintSettingsToAllArtboards(template:DesignTemplate,settings:Partial<ArtboardPrintSettings>):DesignTemplate {return{...template,artboards:template.artboards.map(artboard=>({...artboard,print:resolvePrintSettings(settings)}))};}

export function validateArtboardPrint(artboard:Artboard,assets:readonly AssetReference[]):ArtboardPrintValidationResult {const settings=resolvePrintSettings(artboard.print),issues:PrintValidationIssue[]=[],add=(code:string,severity:PrintValidationIssue['severity'],message:string,elementId?:string,details?:Record<string,unknown>)=>issues.push({id:`${artboard.id}:${elementId??'artboard'}:${code}`,code,severity,artboardId:artboard.id,elementId,message,details});
  if(!(artboard.widthMm>0&&artboard.heightMm>0))add('PRINT_DIMENSIONS_INVALID','ERROR','Trim dimensions must be greater than zero.');
  const insetValues=[...Object.values(settings.bleed),...Object.values(settings.safeArea)];if(insetValues.some(value=>!Number.isFinite(value)||value<0))add('PRINT_INSETS_INVALID','ERROR','Bleed and safe-area values must be non-negative.');
  if(settings.safeArea.leftMm+settings.safeArea.rightMm>=artboard.widthMm||settings.safeArea.topMm+settings.safeArea.bottomMm>=artboard.heightMm)add('PRINT_SAFE_AREA_IMPOSSIBLE','ERROR','Safe area consumes the usable trim area.');
  for(const element of artboard.elements){if(!element.visible)continue;if(element.type==='IMAGE'){const asset=assets.find(item=>item.id===element.assetId),kind=assetRenderKind(asset);if(kind==='MISSING')add('PRINT_ASSET_MISSING','ERROR','Raster asset is missing.',element.id);else if(kind==='UNSUPPORTED')add('PRINT_ASSET_UNSUPPORTED','ERROR','Asset format is unsupported.',element.id);else{const quality=imagePrintQuality(element,asset,settings);if(quality.status==='LOW')add('PRINT_RASTER_DPI_LOW','WARNING',quality.message,element.id,{...quality});else if(quality.status==='WARNING')add('PRINT_RASTER_DPI_WARNING','WARNING',quality.message,element.id,{...quality});else if(quality.status==='UNKNOWN')add('PRINT_RASTER_DIMENSIONS_MISSING','WARNING',quality.message,element.id);}}
    if(element.type==='SVG'){const kind=assetRenderKind(assets.find(item=>item.id===element.assetId));if(kind==='MISSING')add('PRINT_ASSET_MISSING','ERROR','Vector asset is missing.',element.id);else if(kind!=='VECTOR_SVG')add('PRINT_ASSET_UNSUPPORTED','ERROR','Vector asset format is unsupported.',element.id);else add('PRINT_VECTOR_READY','INFO','Vector — resolution independent.',element.id);}
    const bleed=settings.bleed;if(element.position.xMm+element.size.widthMm< -bleed.leftMm||element.position.yMm+element.size.heightMm< -bleed.topMm||element.position.xMm>artboard.widthMm+bleed.rightMm||element.position.yMm>artboard.heightMm+bleed.bottomMm)add('PRINT_ELEMENT_OUTSIDE_BLEED','WARNING','Element is outside the printable bleed area.',element.id);
  }
  return{artboardId:artboard.id,issues,errors:issues.filter(issue=>issue.severity==='ERROR').length,warnings:issues.filter(issue=>issue.severity==='WARNING').length,info:issues.filter(issue=>issue.severity==='INFO').length};}
export function validateDesignPrint(template:DesignTemplate,artboardIds?:readonly string[]):DesignPrintValidationResult {const selected=artboardIds?new Set(artboardIds):null,artboards=template.artboards.filter(artboard=>!selected||selected.has(artboard.id)).map(artboard=>validateArtboardPrint(artboard,template.sharedAssets)),issues=artboards.flatMap(result=>result.issues);return{artboards,issues,errors:artboards.reduce((sum,result)=>sum+result.errors,0),warnings:artboards.reduce((sum,result)=>sum+result.warnings,0),info:artboards.reduce((sum,result)=>sum+result.info,0)};}
