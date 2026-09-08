import type { TextDesignElement, TextLayerEffect, TextLayerEffectType } from '@document-tool/contracts';

const clamp01=(value:number)=>Math.max(0,Math.min(1,Number.isFinite(value)?value:1));

export function defaultTextLayerEffect(type:TextLayerEffectType,id:string):TextLayerEffect{
  if(type==='STROKE')return{id,type,enabled:true,opacity:1,blendMode:'NORMAL',settings:{color:'#111827',widthMm:.25,position:'CENTER'}};
  if(type==='COLOR_OVERLAY')return{id,type,enabled:true,opacity:1,blendMode:'NORMAL',settings:{color:'#7c3aed'}};
  if(type==='GRADIENT_OVERLAY')return{id,type,enabled:true,opacity:1,blendMode:'NORMAL',settings:{gradient:{type:'LINEAR',angleDeg:90,stops:[{offset:0,color:'#ffffff',opacity:1},{offset:100,color:'#7c3aed',opacity:1}]},gradientScalePct:100,gradientReverse:false}};
  if(type==='PATTERN_OVERLAY')return{id,type,enabled:true,opacity:1,blendMode:'NORMAL',settings:{pattern:{kind:'HATCH',foreground:'#111827',background:'#ffffff',scale:8,rotationDeg:45,opacity:1},patternOffsetX:0,patternOffsetY:0}};
  if(type==='INNER_SHADOW')return{id,type,enabled:true,opacity:.45,blendMode:'MULTIPLY',settings:{color:'#111827',offsetXmm:.2,offsetYmm:.2,blurMm:.4,spread:0}};
  if(type==='INNER_GLOW')return{id,type,enabled:true,opacity:.5,blendMode:'SCREEN',settings:{color:'#ffffff',blurMm:.8,spread:0}};
  if(type==='OUTER_GLOW')return{id,type,enabled:true,opacity:.65,blendMode:'SCREEN',settings:{color:'#60a5fa',blurMm:1.5,spread:0}};
  if(type==='DROP_SHADOW')return{id,type,enabled:true,opacity:.4,blendMode:'MULTIPLY',settings:{color:'#111827',offsetXmm:.5,offsetYmm:.5,angleDeg:45,distanceMm:.71,blurMm:.6,spread:0,noise:0,choke:0}};
  if(type==='SATIN')return{id,type,enabled:true,opacity:.5,blendMode:'MULTIPLY',settings:{color:'#111827',angleDeg:19,distanceMm:.8,sizeMm:1.2,satinInvert:false,glossContour:'GAUSSIAN'}};
  return{id,type:'BEVEL_EMBOSS',enabled:true,opacity:1,blendMode:'NORMAL',settings:{depthMm:.35,depthPct:100,sizeMm:.35,softenMm:.1,direction:'UP',bevelStyle:'INNER_BEVEL',bevelTechnique:'SMOOTH',useGlobalLight:true,angleDeg:120,altitudeDeg:30,highlightColor:'#ffffff',highlightOpacity:.75,highlightBlendMode:'SCREEN',shadowColor:'#111827',shadowOpacity:.75,shadowBlendMode:'MULTIPLY',glossContour:'LINEAR',contourStrength:1,textureDepth:0,textureInvert:false,textureLinked:true}};
}

export function normalizeTextLayerEffects(effects:TextLayerEffect[]|undefined):TextLayerEffect[]{
  if(!effects?.length)return[];
  const seen=new Set<string>();
  return effects.map((effect,index)=>{
    let id=typeof effect.id==='string'&&effect.id.trim()?effect.id:`text-effect-${index+1}`;
    while(seen.has(id))id=`${id}-${index+1}`;
    seen.add(id);
    return{...effect,id,enabled:effect.enabled!==false,opacity:clamp01(effect.opacity??1),blendMode:effect.blendMode??'NORMAL',settings:{...effect.settings}};
  });
}

export function migrateLegacyTextEffects(style:TextDesignElement['style'],idFactory:(prefix:string)=>string):TextLayerEffect[]{
  if(style.layerEffects?.length)return normalizeTextLayerEffects(style.layerEffects);
  const result:TextLayerEffect[]=[];
  if(style.stroke&&style.stroke.widthMm>0){const e=defaultTextLayerEffect('STROKE',idFactory('stroke'));e.opacity=style.stroke.opacity??1;e.settings={...e.settings,color:style.stroke.color,widthMm:style.stroke.widthMm};result.push(e);}
  if(style.glow?.enabled){const e=defaultTextLayerEffect('OUTER_GLOW',idFactory('outer-glow'));e.opacity=style.glow.opacity;e.settings={...e.settings,color:style.glow.color,blurMm:style.glow.blurMm};result.push(e);}
  const advanced=style.advancedEffects;
  if(advanced?.innerShadow?.enabled){const v=advanced.innerShadow,e=defaultTextLayerEffect('INNER_SHADOW',idFactory('inner-shadow'));e.opacity=v.opacity;e.settings={...e.settings,color:v.color,offsetXmm:v.offsetXmm,offsetYmm:v.offsetYmm,blurMm:v.blurMm};result.push(e);}
  if(advanced?.innerGlow?.enabled){const v=advanced.innerGlow,e=defaultTextLayerEffect('INNER_GLOW',idFactory('inner-glow'));e.opacity=v.opacity;e.settings={...e.settings,color:v.color,blurMm:v.blurMm};result.push(e);}
  if(advanced?.bevel?.enabled){const v=advanced.bevel,e=defaultTextLayerEffect('BEVEL_EMBOSS',idFactory('bevel'));e.settings={...e.settings,depthMm:v.depthMm,sizeMm:v.depthMm,highlightColor:v.highlightColor,shadowColor:v.shadowColor};result.push(e);}
  return result;
}

export function addTextLayerEffect(effects:TextLayerEffect[]|undefined,type:TextLayerEffectType,id:string){return[...normalizeTextLayerEffects(effects),defaultTextLayerEffect(type,id)];}
export function removeTextLayerEffect(effects:TextLayerEffect[]|undefined,id:string){return normalizeTextLayerEffects(effects).filter(effect=>effect.id!==id);}
export function toggleTextLayerEffect(effects:TextLayerEffect[]|undefined,id:string,enabled?:boolean){return normalizeTextLayerEffects(effects).map(effect=>effect.id===id?{...effect,enabled:enabled??!effect.enabled}:effect);}
export function duplicateTextLayerEffect(effects:TextLayerEffect[]|undefined,id:string,newId:string){const normalized=normalizeTextLayerEffects(effects),source=normalized.find(effect=>effect.id===id);if(!source)return normalized;const index=normalized.findIndex(effect=>effect.id===id);const copy={...source,id:newId,name:source.name?`${source.name} Copy`:undefined,settings:{...source.settings,gradient:source.settings.gradient?{...source.settings.gradient,stops:source.settings.gradient.stops.map(stop=>({...stop}))}:undefined,pattern:source.settings.pattern?{...source.settings.pattern}:undefined}};return[...normalized.slice(0,index+1),copy,...normalized.slice(index+1)];}
export function resetTextLayerEffect(effects:TextLayerEffect[]|undefined,id:string){return normalizeTextLayerEffects(effects).map(effect=>effect.id===id?defaultTextLayerEffect(effect.type,id):effect);}
export function moveTextLayerEffect(effects:TextLayerEffect[]|undefined,id:string,direction:'UP'|'DOWN'){const normalized=normalizeTextLayerEffects(effects),index=normalized.findIndex(effect=>effect.id===id);if(index<0)return normalized;const target=direction==='UP'?index-1:index+1;if(target<0||target>=normalized.length)return normalized;const next=[...normalized];[next[index],next[target]]=[next[target]!,next[index]!];return next;}
export function enabledTextLayerEffects(effects:TextLayerEffect[]|undefined,type?:TextLayerEffectType){return normalizeTextLayerEffects(effects).filter(effect=>effect.enabled&&(!type||effect.type===type));}
