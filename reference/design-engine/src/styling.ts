import type {
  DesignElement,
  DesignFill,
  DesignGradientStop,
  DesignImageTransform,
  DesignLinearGradient,
  DesignPatternFill,
  DesignRadialGradient,
  DesignShadow,
  DesignStroke,
  DesignTemplate,
} from '@document-tool/contracts';

export type StyleClipboardKind='TEXT'|'SHAPE'|'IMAGE'|'SVG';
export interface DesignStyleClipboard { kind:StyleClipboardKind; opacity:number; visual:Record<string,unknown>; }

export const DEFAULT_DESIGN_SHADOW:DesignShadow={enabled:false,color:'#000000',opacity:.25,offsetXmm:1,offsetYmm:1,blurMm:2};
export const DEFAULT_DESIGN_STROKE:DesignStroke={color:'#000000',widthMm:0,style:'NONE',opacity:1,lineCap:'BUTT',lineJoin:'MITER',miterLimit:4,dashOffset:0};
export const DEFAULT_SHAPE_FILL:DesignFill={type:'SOLID',color:'#dbeafe',opacity:1};
export const DEFAULT_IMAGE_FILL_TRANSFORM:DesignImageTransform={scale:1,offsetX:0,offsetY:0,rotationDeg:0};
export const DEFAULT_RADIAL_GRADIENT:DesignRadialGradient={type:'RADIAL',centerX:50,centerY:50,radius:50,stops:[{offset:0,color:'#2563eb'},{offset:100,color:'#dbeafe'}]};
export const DEFAULT_PATTERN_FILL:DesignPatternFill={kind:'HATCH',foreground:'#2563eb',background:'#ffffff',scale:1,rotationDeg:0,opacity:1};

const supported=(element:DesignElement):element is Extract<DesignElement,{type:StyleClipboardKind}>=>['TEXT','SHAPE','IMAGE','SVG'].includes(element.type);
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const finite=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
export const normalizeStyleOpacity=(value:number)=>Number.isFinite(value)?Math.min(1,Math.max(0,value)):1;
export const normalizeGradientAngle=(value:number)=>Number.isFinite(value)?Math.min(360,Math.max(0,value)):0;
const normalizeRotationAngle=(value:number)=>Number.isFinite(value)?((value%360)+360)%360:0;
export const normalizeGradientStopPosition=(value:number)=>Number.isFinite(value)?Math.min(100,Math.max(0,value)):0;

function normalizeStops(stops:DesignGradientStop[]|undefined):DesignGradientStop[] {
  const fallback:DesignGradientStop[]=[{offset:0,color:'#2563eb'},{offset:100,color:'#dbeafe'}];
  const supplied=Array.isArray(stops)&&stops.length>=2?stops:fallback;
  return supplied
    .map(stop=>({
      ...stop,
      offset:normalizeGradientStopPosition(stop.offset),
      color:stop.color||'#000000',
      opacity:stop.opacity===undefined?undefined:normalizeStyleOpacity(stop.opacity),
    }))
    .sort((a,b)=>a.offset-b.offset);
}

export function normalizeLinearGradient(gradient:Partial<DesignLinearGradient>={}):DesignLinearGradient {
  return {type:'LINEAR',angleDeg:normalizeGradientAngle(gradient.angleDeg??0),stops:normalizeStops(gradient.stops)};
}

export function normalizeRadialGradient(gradient:Partial<DesignRadialGradient>={}):DesignRadialGradient {
  const centerX=clamp(finite(gradient.centerX,DEFAULT_RADIAL_GRADIENT.centerX),0,100);
  const centerY=clamp(finite(gradient.centerY,DEFAULT_RADIAL_GRADIENT.centerY),0,100);
  return {
    type:'RADIAL',
    centerX,
    centerY,
    radius:clamp(finite(gradient.radius,DEFAULT_RADIAL_GRADIENT.radius),1,200),
    ...(gradient.focalX===undefined?{}:{focalX:clamp(finite(gradient.focalX,centerX),0,100)}),
    ...(gradient.focalY===undefined?{}:{focalY:clamp(finite(gradient.focalY,centerY),0,100)}),
    stops:normalizeStops(gradient.stops),
  };
}

export function normalizePatternFill(pattern:Partial<DesignPatternFill>={}):DesignPatternFill {
  const kind=pattern.kind==='DOT'||pattern.kind==='CHECKER'||pattern.kind==='HATCH'?pattern.kind:'HATCH';
  return {
    kind,
    foreground:pattern.foreground||DEFAULT_PATTERN_FILL.foreground,
    background:pattern.background||DEFAULT_PATTERN_FILL.background,
    scale:clamp(finite(pattern.scale,1),0.25,8),
    rotationDeg:normalizeRotationAngle(finite(pattern.rotationDeg,0)),
    ...(pattern.opacity===undefined?{}:{opacity:normalizeStyleOpacity(pattern.opacity)}),
  };
}

export function normalizeImageFillTransform(transform:Partial<DesignImageTransform>|undefined):DesignImageTransform {
  return {
    scale:clamp(finite(transform?.scale,1),0.1,10),
    offsetX:clamp(finite(transform?.offsetX,0),-200,200),
    offsetY:clamp(finite(transform?.offsetY,0),-200,200),
    rotationDeg:normalizeRotationAngle(finite(transform?.rotationDeg,0)),
  };
}

export function createLinearGradientFill(angleDeg=0,stops?:DesignGradientStop[]):DesignFill {
  return {type:'LINEAR_GRADIENT',gradient:normalizeLinearGradient({type:'LINEAR',angleDeg,stops})};
}

export function createRadialGradientFill(stops?:DesignGradientStop[]):DesignFill {
  return {type:'RADIAL_GRADIENT',gradient:normalizeRadialGradient({...DEFAULT_RADIAL_GRADIENT,stops})};
}

export function createPatternFill(pattern:Partial<DesignPatternFill>={}):DesignFill {
  return {type:'PATTERN',pattern:normalizePatternFill(pattern)};
}

export interface ParsedStrokeDashPattern {
  dashArray?: number[];
  error?: string;
}

export function parseStrokeDashPatternText(text:string):ParsedStrokeDashPattern {
  const trimmed=text.trim();
  if(!trimmed)return {error:'Enter at least two positive dash lengths, for example 12, 3.'};
  const tokens=trimmed.split(/[\s,]+/).filter(Boolean);
  const values=tokens.map(Number);
  if(values.some(value=>!Number.isFinite(value)||value<=0))return {error:'Use positive numbers separated by commas or spaces.'};
  if(values.length<2)return {error:'Enter at least two dash lengths, for example 12, 3.'};
  return {dashArray:values};
}

export function normalizeStrokeDashArray(stroke:DesignStroke):number[]|undefined {
  if(stroke.style==='NONE'||stroke.style==='SOLID')return undefined;
  if(stroke.style==='CUSTOM'){
    const values=(stroke.dashArray??[]).filter(value=>Number.isFinite(value)&&value>0);
    return values.length>=2?values:undefined;
  }
  if(stroke.style==='DASHED')return [2,1.2];
  return [0.7,1];
}

export function copyDesignElementStyle(element:DesignElement):DesignStyleClipboard|null {
  if(!supported(element))return null;
  switch(element.type){
    case 'TEXT': return {kind:'TEXT',opacity:normalizeStyleOpacity(element.opacity),visual:clone({style:element.style,shadow:element.shadow})};
    case 'SHAPE': return {kind:'SHAPE',opacity:normalizeStyleOpacity(element.opacity),visual:clone({fill:element.fill,stroke:element.stroke,cornerRadiusMm:element.cornerRadiusMm,shadow:element.shadow})};
    case 'IMAGE': return {kind:'IMAGE',opacity:normalizeStyleOpacity(element.opacity),visual:clone({fit:element.fit,flipX:element.flipX,flipY:element.flipY,maintainAspectRatio:element.maintainAspectRatio,cornerRadiusMm:element.cornerRadiusMm,stroke:element.stroke,shadow:element.shadow})};
    case 'SVG': return {kind:'SVG',opacity:normalizeStyleOpacity(element.opacity),visual:clone({preserveVector:element.preserveVector,tintColor:element.tintColor,stroke:element.stroke,shadow:element.shadow})};
  }
}

export function pasteDesignElementStyle(element:DesignElement,clipboard:DesignStyleClipboard):DesignElement {
  if(!supported(element))return element;
  const opacity=normalizeStyleOpacity(clipboard.opacity);
  if(element.type!==clipboard.kind)return {...element,opacity};
  const visual=clone(clipboard.visual);
  switch(element.type){
    case 'TEXT': return {...element,opacity,...visual} as typeof element;
    case 'SHAPE': return {...element,opacity,...visual} as typeof element;
    case 'IMAGE': return {...element,opacity,...visual} as typeof element;
    case 'SVG': return {...element,opacity,...visual} as typeof element;
  }
}

export function resetDesignElementStyle(element:DesignElement):DesignElement {
  switch(element.type){
    case 'TEXT': return {...element,opacity:1,style:{fontFamily:'Arial',fontSizePt:18,fontWeight:400,italic:false,underline:false,strikethrough:false,color:'#111827',alignment:'LEFT',paragraphAlignment:'LEFT',verticalAlignment:'TOP',lineHeight:1.2,letterSpacingPt:0,paddingMm:0,textCase:'NONE',fill:{type:'SOLID',color:'#111827',opacity:1},stroke:{color:'#111827',widthMm:0,opacity:1},glow:{enabled:false,color:'#60a5fa',blurMm:1.5,opacity:.65}},shadow:clone(DEFAULT_DESIGN_SHADOW)};
    case 'SHAPE': return {...element,opacity:1,fill:clone(DEFAULT_SHAPE_FILL),stroke:{color:'#2563eb',widthMm:.35,style:'SOLID',opacity:1,lineCap:'BUTT',lineJoin:'MITER',miterLimit:4,dashOffset:0},cornerRadiusMm:element.shape==='ROUNDED_RECTANGLE'?3:0,shadow:clone(DEFAULT_DESIGN_SHADOW)};
    case 'IMAGE': return {...element,opacity:1,fit:'FIT',flipX:false,flipY:false,maintainAspectRatio:true,cornerRadiusMm:0,stroke:clone(DEFAULT_DESIGN_STROKE),shadow:clone(DEFAULT_DESIGN_SHADOW)};
    case 'SVG': return {...element,opacity:1,preserveVector:true,tintColor:undefined,stroke:clone(DEFAULT_DESIGN_STROKE),shadow:clone(DEFAULT_DESIGN_SHADOW)};
    default:return element;
  }
}

export function updateElementsOpacity(template:DesignTemplate,artboardId:string,elementIds:readonly string[],opacity:number):DesignTemplate {
  const ids=new Set(elementIds),normalized=normalizeStyleOpacity(opacity);
  return {...template,artboards:template.artboards.map(a=>a.id===artboardId?{...a,elements:a.elements.map(e=>ids.has(e.id)&&!e.locked&&supported(e)?{...e,opacity:normalized}:e)}:a)};
}
