import { repairArtboardGroupIntegrity } from './group-integrity.js';
import type {
  AssetReference,
  DesignElement,
  DesignShapeKind,
  DesignTemplate,
  ImageDesignElement,
  ShapeDesignElement,
  TextDesignElement,
  SvgDesignElement,
  QrDesignElement,
  BarcodeDesignElement,
} from '@document-tool/contracts';

export interface ElementFactoryOptions {
  id:string;
  name?:string;
  xMm?:number;
  yMm?:number;
  widthMm?:number;
  heightMm?:number;
  zIndex?:number;
}

export function nextElementZIndex(template:DesignTemplate, artboardId:string):number {
  const artboard=template.artboards.find(a=>a.id===artboardId);
  if(!artboard?.elements.length)return 0;
  return Math.max(...artboard.elements.map(e=>e.zIndex))+1;
}

export function createTextElement(options:ElementFactoryOptions):TextDesignElement {
  return {
    id:options.id,
    type:'TEXT',
    name:options.name??'Text',
    position:{xMm:options.xMm??10,yMm:options.yMm??10},
    size:{widthMm:options.widthMm??45,heightMm:options.heightMm??12},
    rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:options.zIndex??0,
    text:'Double-click to edit',
    style:{fontFamily:'Arial',fontSizePt:18,fontWeight:400,italic:false,underline:false,strikethrough:false,color:'#111827',alignment:'LEFT',paragraphAlignment:'LEFT',verticalAlignment:'TOP',lineHeight:1.2,letterSpacingPt:0,paddingMm:0,textCase:'NONE',fill:{type:'SOLID',color:'#111827',opacity:1},stroke:{color:'#111827',widthMm:0,opacity:1},glow:{enabled:false,color:'#60a5fa',blurMm:1.5,opacity:.65},materialPreset:'CUSTOM',advancedEffects:{bevel:{enabled:false,depthMm:.35,highlightColor:'#ffffff',shadowColor:'#111827',intensity:.65},highlight:{enabled:false,color:'#ffffff',offsetYmm:-.25,blurMm:.25,opacity:.6},longShadow:{enabled:false,color:'#111827',distanceMm:2,angleDeg:45,opacity:.45},innerShadow:{enabled:false,color:'#111827',offsetXmm:.18,offsetYmm:.18,blurMm:.3,opacity:.45},innerGlow:{enabled:false,color:'#ffffff',blurMm:.7,opacity:.45},secondaryStroke:{enabled:false,color:'#ffffff',widthMm:.35,opacity:1},reflection:{enabled:false,color:'#ffffff',offsetYmm:.35,blurMm:.35,opacity:.35},grain:{enabled:false,color:'#111827',amount:35,opacity:.18}},textPath:{mode:'BOX',startOffsetPct:50,reverse:false,side:'OUTSIDE'},autoFit:{enabled:false,minFontSizePt:6},layerEffects:[]},
    shadow:{enabled:false,color:'#000000',opacity:.25,offsetXmm:1,offsetYmm:1,blurMm:2},
  };
}

export function createShapeElement(shape:DesignShapeKind, options:ElementFactoryOptions):ShapeDesignElement {
  return {
    id:options.id,
    type:'SHAPE',
    name:options.name??shapeLabel(shape),
    position:{xMm:options.xMm??12,yMm:options.yMm??12},
    size:{widthMm:options.widthMm??28,heightMm:options.heightMm??18},
    rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:options.zIndex??0,
    shape,
    fill:{type:'SOLID',color:'#dbeafe',opacity:1},
    stroke:{color:'#2563eb',widthMm:.35,style:'SOLID'},
    cornerRadiusMm:shape==='ROUNDED_RECTANGLE'?3:0,
    shadow:{enabled:false,color:'#000000',opacity:.25,offsetXmm:1,offsetYmm:1,blurMm:2},
  };
}

export function createImageElement(assetId:string, options:ElementFactoryOptions):ImageDesignElement {
  return {
    id:options.id,
    type:'IMAGE',
    name:options.name??'Image',
    position:{xMm:options.xMm??12,yMm:options.yMm??12},
    size:{widthMm:options.widthMm??35,heightMm:options.heightMm??25},
    rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:options.zIndex??0,
    assetId,fit:'FIT',flipX:false,flipY:false,maintainAspectRatio:true,cornerRadiusMm:0,
    stroke:{color:'#000000',widthMm:0,style:'NONE',opacity:1},shadow:{enabled:false,color:'#000000',opacity:.25,offsetXmm:1,offsetYmm:1,blurMm:2},
  };
}


export function createSvgElement(assetId:string, options:ElementFactoryOptions):SvgDesignElement {
  return {
    id:options.id,
    type:'SVG',
    name:options.name??'Vector Asset',
    position:{xMm:options.xMm??12,yMm:options.yMm??12},
    size:{widthMm:options.widthMm??30,heightMm:options.heightMm??30},
    rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:options.zIndex??0,
    assetId,preserveVector:true,stroke:{color:'#000000',widthMm:0,style:'NONE',opacity:1},shadow:{enabled:false,color:'#000000',opacity:.25,offsetXmm:1,offsetYmm:1,blurMm:2},
  };
}

export function createQrElement(options:ElementFactoryOptions):QrDesignElement {
  return {
    id:options.id,
    type:'QR',
    name:options.name??'QR Code',
    position:{xMm:options.xMm??12,yMm:options.yMm??12},
    size:{widthMm:options.widthMm??20,heightMm:options.heightMm??20},
    rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:options.zIndex??0,
    value:'https://example.com',
    foreground:'#000000',
    background:'#ffffff',
    errorCorrection:'M',
  };
}

export function createBarcodeElement(options:ElementFactoryOptions):BarcodeDesignElement {
  return {
    id:options.id,
    type:'BARCODE',
    name:options.name??'Barcode',
    position:{xMm:options.xMm??12,yMm:options.yMm??12},
    size:{widthMm:options.widthMm??35,heightMm:options.heightMm??15},
    rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:options.zIndex??0,
    value:'123456789012',
    symbology:'CODE128',
    foreground:'#000000',
    background:'#ffffff',
  };
}

export function addDesignElement(template:DesignTemplate,artboardId:string,element:DesignElement):DesignTemplate {
  return {...template,artboards:template.artboards.map(a=>a.id===artboardId?{...a,elements:[...a.elements,element]}:a)};
}

export function updateDesignElement(template:DesignTemplate,artboardId:string,elementId:string,updater:(element:DesignElement)=>DesignElement):DesignTemplate {
  return {...template,artboards:template.artboards.map(a=>a.id===artboardId?{...a,elements:a.elements.map(e=>e.id===elementId?updater(e):e)}:a)};
}

export function deleteDesignElements(template:DesignTemplate,artboardId:string,elementIds:readonly string[]):DesignTemplate {
  const requested=new Set(elementIds);
  return {...template,artboards:template.artboards.map(a=>{
    if(a.id!==artboardId)return a;
    const deleted=new Set(a.elements.filter(e=>requested.has(e.id)&&!e.locked).map(e=>e.id));
    if(!deleted.size)return a;
    return repairArtboardGroupIntegrity({...a,elements:a.elements.filter(e=>!deleted.has(e.id)),groups:a.groups.map(g=>({...g,elementIds:g.elementIds.filter(id=>!deleted.has(id))}))});
  })};
}

export function addAssetReference(template:DesignTemplate,asset:AssetReference):DesignTemplate {
  const existing=template.sharedAssets.find(a=>a.id===asset.id);
  if(existing)return {...template,sharedAssets:template.sharedAssets.map(a=>a.id===asset.id?asset:a)};
  return {...template,sharedAssets:[...template.sharedAssets,asset]};
}

function shapeLabel(shape:DesignShapeKind):string {
  return shape.toLowerCase().split('_').map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(' ');
}
