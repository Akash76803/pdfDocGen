import type { ArtboardPrintSettings,AssetReference,CardRenderModel, DesignElement, DesignTemplate, ResolvedArtboard, ResolvedDesignElement } from '@document-tool/contracts';
import { validateDesignTemplate } from './validation.js';
import type { DesignElementRegistry } from './element-registry.js';
import { resolvePrintSettings } from './print/index.js';
import { imagePrintQuality } from './print/index.js';
import { assetRenderKind } from './assets/index.js';

export interface CardRenderResolutionContext {
  recordKey?:string;
  metadata?:Record<string,unknown>;
}

export interface CardRenderResolutionResult { model:CardRenderModel|null; warnings:string[]; errors:string[]; }

export function resolveCardRenderModel(template:DesignTemplate, context:CardRenderResolutionContext={}, registry?:DesignElementRegistry):CardRenderResolutionResult {
  const validation=validateDesignTemplate(template,registry);
  if (!validation.valid) return {model:null,warnings:validation.warnings.map(i=>i.message),errors:validation.errors.map(i=>i.message)};
  const warnings:string[]=[];
  const artboards:ResolvedArtboard[]=[...template.artboards].sort((a,b)=>a.order-b.order).map(artboard=>({
    id:artboard.id,name:artboard.name,order:artboard.order,widthMm:artboard.widthMm,heightMm:artboard.heightMm,background:artboard.background,print:resolvePrintSettings(artboard.print),
    elements:[...artboard.elements].sort((a,b)=>a.zIndex-b.zIndex).flatMap(element=>{
      const resolved=resolveElement(element,template.sharedAssets,artboard.print);
      return resolved ? [resolved] : [];
    }),
  }));
  return {model:{modelVersion:1,templateId:template.id,templateVersion:template.version,recordKey:context.recordKey,artboards,metadata:context.metadata},warnings,errors:[]};
}

function resolveElement(element:DesignElement, assets:readonly AssetReference[],print:ArtboardPrintSettings):ResolvedDesignElement|null {
  const base:ResolvedDesignElement={id:element.id,type:element.type,name:element.name,position:element.position,size:element.size,rotationDeg:element.rotationDeg,opacity:element.opacity,visible:element.visible,locked:element.locked,zIndex:element.zIndex,groupId:element.groupId,metadata:element.metadata,sourceElementType:element.type==='CUSTOM'?element.customType:element.type,content:{}};
  switch (element.type) {
    case 'TEXT': base.content={text:element.text,style:element.style,shadow:element.shadow}; break;
    case 'SHAPE': base.content={shape:element.shape,fill:element.fill,stroke:element.stroke,cornerRadiusMm:element.cornerRadiusMm,points:element.points,shadow:element.shadow,label:element.label,flipX:element.flipX,flipY:element.flipY}; break;
    case 'PATH': base.content={geometry:element.geometry,fill:element.fill,stroke:element.stroke,shadow:element.shadow,label:element.label}; break;
    case 'IMAGE': {const asset=assets.find(item=>item.id===element.assetId);base.content={assetId:element.assetId,assetRenderKind:assetRenderKind(asset),printQuality:imagePrintQuality(element,asset,print),fit:element.fit,flipX:element.flipX,flipY:element.flipY,maintainAspectRatio:element.maintainAspectRatio,cornerRadiusMm:element.cornerRadiusMm,stroke:element.stroke,shadow:element.shadow}; break;}
    case 'SVG': {const asset=assets.find(item=>item.id===element.assetId);base.content={assetId:element.assetId,assetRenderKind:assetRenderKind(asset),printQuality:{status:'VECTOR',message:'Vector — resolution independent'},preserveVector:element.preserveVector,vectorFormat:'SVG',tintColor:element.tintColor,stroke:element.stroke,shadow:element.shadow,flipX:element.flipX,flipY:element.flipY}; break;}
    case 'QR': base.content={value:element.value,foreground:element.foreground,background:element.background,errorCorrection:element.errorCorrection}; break;
    case 'BARCODE': base.content={value:element.value,symbology:element.symbology,foreground:element.foreground,background:element.background}; break;
    case 'CUSTOM': base.content={customType:element.customType,props:element.props,boundValue:undefined}; break;
  }
  return base;
}
