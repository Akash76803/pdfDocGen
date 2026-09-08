import React from 'react';

import type { Artboard, DesignElement, DesignTemplate, DesignShadow, DesignFill, DesignStroke, QrDesignElement, PathDesignElement, TextDesignElement, TextStyleRunStyle, TextLayerEffect } from '@document-tool/contracts';
import QRCode from 'react-qr-code';
import { geometryToSvgPath, shapeToPathGeometry, resolveRasterImageElementSource, resolveRasterImageFillSource, normalizeImageFillTransform, normalizeStrokeDashArray, buildRichTextSegments } from '@document-tool/design-engine';
import { resolvePathRasterBounds } from './cardExportPathBounds';

export function normalizeExportColor(value: string | undefined | null): string {
  if (!value) return 'transparent';
  if (value.startsWith('var(')) {
    // In an ideal system, we would resolve vars, but export shouldn't contain them.
    // If it does, we strip it to black or transparent.
    return 'transparent';
  }
  if (value.startsWith('color(display-p3')) {
    const match = value.match(/color\(\s*display-p3\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+))?\s*\)/);
    if (match) {
      const r = Math.max(0, Math.min(255, Math.round(parseFloat(match[1]) * 255)));
      const g = Math.max(0, Math.min(255, Math.round(parseFloat(match[2]) * 255)));
      const b = Math.max(0, Math.min(255, Math.round(parseFloat(match[3]) * 255)));
      const a = match[4] ? parseFloat(match[4]) : 1;
      return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  }
  return value;
}

function normalizeShadow(shadow?: DesignShadow): string {
  if (!shadow || !shadow.enabled) return 'none';
  const color = normalizeExportColor(shadow.color);
  return `${shadow.offsetXmm}px ${shadow.offsetYmm}px ${shadow.blurMm}px ${color}`;
}



function exportTextCase(value:string,mode?:'NONE'|'UPPERCASE'|'LOWERCASE'|'TITLE'){if(mode==='UPPERCASE')return value.toUpperCase();if(mode==='LOWERCASE')return value.toLowerCase();if(mode==='TITLE')return value.replace(/\b\p{L}/gu,m=>m.toUpperCase());return value;}

function exportAutoFitFontPt(text:string,element:TextDesignElement){const config=element.style.autoFit;if(!config?.enabled)return element.style.fontSizePt;const padding=Math.max(0,element.style.paddingMm??0);const width=Math.max(1,element.size.widthMm-padding*2),height=Math.max(1,element.size.heightMm-padding*2);const lines=text.split(/\r?\n/),longest=Math.max(1,...lines.map(line=>line.length)),fontMm=element.style.fontSizePt*25.4/72,estimatedWidth=longest*fontMm*.56+Math.max(0,longest-1)*(element.style.letterSpacingPt*25.4/72),estimatedHeight=Math.max(1,lines.length)*fontMm*element.style.lineHeight,scale=Math.min(1,width/Math.max(.001,estimatedWidth),height/Math.max(.001,estimatedHeight));return Math.max(Math.max(1,config.minFontSizePt||1),element.style.fontSizePt*scale)}
function exportRunCss(run:TextStyleRunStyle,baseFontSize:number):React.CSSProperties{const baseline=run.baselineShift??'NORMAL';return{fontFamily:run.fontFamily,fontSize:run.fontSizePt?`${run.fontSizePt}pt`:(baseline!=='NORMAL'?`${Math.max(1,baseFontSize*.68)}pt`:undefined),fontWeight:run.fontWeight,fontStyle:run.italic===true?'italic':run.italic===false?'normal':undefined,textDecoration:[run.underline?'underline':'',run.strikethrough?'line-through':''].filter(Boolean).join(' ')||undefined,color:run.color?normalizeExportColor(run.color):undefined,WebkitTextFillColor:run.color?normalizeExportColor(run.color):undefined,verticalAlign:baseline==='SUPERSCRIPT'?'super':baseline==='SUBSCRIPT'?'sub':undefined,lineHeight:baseline==='NORMAL'?undefined:1}}
function renderExportRichTextHtml(text:string,style:TextDesignElement['style']):React.ReactNode{const segments=buildRichTextSegments(text,style.runs);if(segments.length===1&&!Object.keys(segments[0]?.style??{}).length)return text;return segments.map((segment,index)=><span key={`${segment.start}-${segment.end}-${index}`} style={exportRunCss(segment.style,style.fontSizePt)}>{segment.text}</span>)}
function renderExportRichTextSvg(text:string,style:TextDesignElement['style']):React.ReactNode{const segments=buildRichTextSegments(text,style.runs);if(segments.length===1&&!Object.keys(segments[0]?.style??{}).length)return text;return segments.map((segment,index)=>{const run=segment.style,baseline=run.baselineShift??'NORMAL';return <tspan key={`${segment.start}-${segment.end}-${index}`} fontFamily={run.fontFamily} fontSize={run.fontSizePt??(baseline!=='NORMAL'?Math.max(1,style.fontSizePt*.68):undefined)} fontWeight={run.fontWeight} fontStyle={run.italic===true?'italic':run.italic===false?'normal':undefined} textDecoration={[run.underline?'underline':'',run.strikethrough?'line-through':''].filter(Boolean).join(' ')||undefined} fill={run.color?normalizeExportColor(run.color):undefined} baselineShift={baseline==='SUPERSCRIPT'?'super':baseline==='SUBSCRIPT'?'sub':undefined}>{segment.text}</tspan>})}
function exportTextPathInfo(element:TextDesignElement,artboard:Artboard):{d:string;transform?:string}{const cfg=element.style.textPath,reverse=cfg?.reverse===true;if(cfg?.mode==='ARC_UP')return{d:reverse?'M 92 78 Q 50 10 8 78':'M 8 78 Q 50 10 92 78'};if(cfg?.mode==='ARC_DOWN')return{d:reverse?'M 92 22 Q 50 90 8 22':'M 8 22 Q 50 90 92 22'};if(cfg?.mode==='CIRCLE'){const r=cfg.side==='INSIDE'?34:42;return{d:reverse?`M 50 ${50+r} A ${r} ${r} 0 1 0 49.99 ${50+r}`:`M 50 ${50+r} A ${r} ${r} 0 1 1 50.01 ${50+r}`}}if(cfg?.mode==='PATH'&&cfg.pathElementId){const path=artboard.elements.find(item=>item.id===cfg.pathElementId&&item.type==='PATH') as PathDesignElement|undefined;if(path&&path.geometry.points.length){const xs=path.geometry.points.map(pt=>pt.x),ys=path.geometry.points.map(pt=>pt.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),w=Math.max(.001,maxX-minX),h=Math.max(.001,maxY-minY),scale=Math.min(84/w,70/h),tx=8-minX*scale+(84-w*scale)/2,ty=15-minY*scale+(70-h*scale)/2;return{d:geometryToSvgPath(path.geometry),transform:`translate(${tx} ${ty}) scale(${reverse?-scale:scale} ${scale})${reverse?` translate(${-w-minX*2} 0)`:''}`}}}return{d:reverse?'M 92 50 L 8 50':'M 8 50 L 92 50'}}
function exportOverlayStops(effect:TextLayerEffect){const gradient=effect.settings.gradient;if(!gradient)return[];const source=effect.settings.gradientReverse?[...gradient.stops].reverse().map(stop=>({...stop,offset:100-stop.offset})):gradient.stops;return [...source].map(stop=>({...stop,opacity:(stop.opacity??1)*(effect.opacity??1)})).sort((a,b)=>a.offset-b.offset)}
function exportPatternBackground(effect:TextLayerEffect){const p=effect.settings.pattern;if(!p)return undefined;const opacity=(p.opacity??1)*(effect.opacity??1),fg=exportTextColorOpacity(p.foreground,opacity),bg=exportTextColorOpacity(p.background,opacity),scale=Math.max(2,p.scale||8);if(p.kind==='DOT')return{image:`radial-gradient(circle, ${fg} 0 22%, transparent 24%), linear-gradient(${bg},${bg})`,size:`${scale}px ${scale}px, 100% 100%`,position:`${effect.settings.patternOffsetX??0}px ${effect.settings.patternOffsetY??0}px, 0 0`};if(p.kind==='CHECKER')return{image:`conic-gradient(${fg} 25%, ${bg} 0 50%, ${fg} 0 75%, ${bg} 0)`,size:`${scale}px ${scale}px`,position:`${effect.settings.patternOffsetX??0}px ${effect.settings.patternOffsetY??0}px`};return{image:`repeating-linear-gradient(${p.rotationDeg??45}deg, ${fg} 0 1px, ${bg} 1px ${Math.max(2,scale)}px)`,size:'auto',position:`${effect.settings.patternOffsetX??0}px ${effect.settings.patternOffsetY??0}px`}}
function exportTextBaseFillBackground(style:TextDesignElement['style']){const fill=style.fill;if(fill?.type==='LINEAR_GRADIENT'){const stops=fill.gradient.stops.map(stop=>`${exportTextColorOpacity(stop.color,stop.opacity??1)} ${stop.offset}%`).join(',');return{image:`linear-gradient(${fill.gradient.angleDeg}deg,${stops})`,size:'100% 100%',position:'0 0'}}if(fill?.type==='RADIAL_GRADIENT'){const stops=fill.gradient.stops.map(stop=>`${exportTextColorOpacity(stop.color,stop.opacity??1)} ${stop.offset}%`).join(',');return{image:`radial-gradient(circle at ${fill.gradient.centerX}% ${fill.gradient.centerY}%,${stops})`,size:'100% 100%',position:'0 0'}}const base=exportTextColorOpacity(fill?.type==='SOLID'?fill.color:style.color,fill?.type==='SOLID'?(fill.opacity??1):1);return{image:`linear-gradient(${base},${base})`,size:'100% 100%',position:'0 0'}}
function exportTextOverlayCss(style:TextDesignElement['style']):React.CSSProperties|undefined{const overlays=(style.layerEffects??[]).filter(effect=>effect.enabled&&(effect.type==='COLOR_OVERLAY'||effect.type==='GRADIENT_OVERLAY'||effect.type==='PATTERN_OVERLAY'));if(!overlays.length)return undefined;const images:string[]=[],sizes:string[]=[],positions:string[]=[],blends:string[]=[];for(const effect of overlays){if(effect.type==='COLOR_OVERLAY'){const c=exportTextColorOpacity(effect.settings.color??'#7c3aed',effect.opacity??1);images.push(`linear-gradient(${c},${c})`);sizes.push('100% 100%');positions.push('0 0')}else if(effect.type==='GRADIENT_OVERLAY'&&effect.settings.gradient){const g=effect.settings.gradient,stops=exportOverlayStops(effect).map(stop=>`${exportTextColorOpacity(stop.color,stop.opacity??1)} ${stop.offset}%`).join(','),scale=Math.max(10,effect.settings.gradientScalePct??100);images.push(g.type==='RADIAL'?`radial-gradient(circle at ${g.centerX}% ${g.centerY}%,${stops})`:`linear-gradient(${g.angleDeg}deg,${stops})`);sizes.push(`${scale}% ${scale}%`);positions.push('center center')}else if(effect.type==='PATTERN_OVERLAY'){const b=exportPatternBackground(effect);if(b){images.push(b.image);sizes.push(b.size);positions.push(b.position)}}else continue;blends.push(exportTextBlendMode(effect.blendMode) as string)}if(!images.length)return undefined;const base=exportTextBaseFillBackground(style);images.push(base.image);sizes.push(base.size);positions.push(base.position);blends.push('normal');return{color:'transparent',backgroundImage:images.join(','),backgroundSize:sizes.join(','),backgroundPosition:positions.join(','),backgroundRepeat:'repeat',backgroundBlendMode:blends.join(',') as React.CSSProperties['backgroundBlendMode'],backgroundClip:'text',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}
function exportTopTextOverlay(style:TextDesignElement['style']){return [...(style.layerEffects??[])].reverse().find(effect=>effect.enabled&&(effect.type==='COLOR_OVERLAY'||effect.type==='GRADIENT_OVERLAY'||effect.type==='PATTERN_OVERLAY'))}
function ExportTextPathPaint({style,id}:{style:TextDesignElement['style'];id:string}){const overlay=exportTopTextOverlay(style);if(overlay?.type==='GRADIENT_OVERLAY'&&overlay.settings.gradient){const g=overlay.settings.gradient,stops=exportOverlayStops(overlay);if(g.type==='LINEAR'){const gid=`export-text-linear-${id}`;return <defs><linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%" gradientTransform={`rotate(${g.angleDeg} .5 .5)`}>{stops.map((stop,index)=><stop key={index} offset={`${stop.offset}%`} stopColor={normalizeExportColor(stop.color)} stopOpacity={stop.opacity??1}/>)}</linearGradient></defs>}const gid=`export-text-radial-${id}`;return <defs><radialGradient id={gid} cx={`${g.centerX}%`} cy={`${g.centerY}%`} r={`${g.radius}%`}>{stops.map((stop,index)=><stop key={index} offset={`${stop.offset}%`} stopColor={normalizeExportColor(stop.color)} stopOpacity={stop.opacity??1}/>)}</radialGradient></defs>}if(overlay?.type==='PATTERN_OVERLAY'&&overlay.settings.pattern){const p=overlay.settings.pattern,gid=`export-text-pattern-${id}`,opacity=(p.opacity??1)*(overlay.opacity??1),scale=Math.max(2,p.scale||8),fg=exportTextColorOpacity(p.foreground,opacity),bg=exportTextColorOpacity(p.background,opacity);return <defs><pattern id={gid} patternUnits="userSpaceOnUse" width={scale} height={scale} patternTransform={`rotate(${p.rotationDeg??0}) translate(${overlay.settings.patternOffsetX??0} ${overlay.settings.patternOffsetY??0})`}><rect width={scale} height={scale} fill={bg}/>{p.kind==='DOT'?<circle cx={scale/2} cy={scale/2} r={Math.max(.5,scale*.22)} fill={fg}/>:p.kind==='CHECKER'?<><rect width={scale/2} height={scale/2} fill={fg}/><rect x={scale/2} y={scale/2} width={scale/2} height={scale/2} fill={fg}/></>:<path d={`M 0 ${scale} L ${scale} 0`} stroke={fg} strokeWidth={1}/>}</pattern></defs>}const fill=style.fill;if(fill?.type==='LINEAR_GRADIENT'){const gid=`export-text-linear-${id}`;return <defs><linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%" gradientTransform={`rotate(${fill.gradient.angleDeg} .5 .5)`}>{fill.gradient.stops.map((stop,index)=><stop key={index} offset={`${stop.offset}%`} stopColor={normalizeExportColor(stop.color)} stopOpacity={stop.opacity??1}/>)}</linearGradient></defs>}if(fill?.type==='RADIAL_GRADIENT'){const gid=`export-text-radial-${id}`;return <defs><radialGradient id={gid} cx={`${fill.gradient.centerX}%`} cy={`${fill.gradient.centerY}%`} r={`${fill.gradient.radius}%`}>{fill.gradient.stops.map((stop,index)=><stop key={index} offset={`${stop.offset}%`} stopColor={normalizeExportColor(stop.color)} stopOpacity={stop.opacity??1}/>)}</radialGradient></defs>}return null}
function exportTextPathFill(style:TextDesignElement['style'],id:string){const overlay=exportTopTextOverlay(style);if(overlay?.type==='COLOR_OVERLAY')return exportTextColorOpacity(overlay.settings.color??'#7c3aed',overlay.opacity??1);if(overlay?.type==='GRADIENT_OVERLAY'&&overlay.settings.gradient)return`url(#export-text-${overlay.settings.gradient.type==='RADIAL'?'radial':'linear'}-${id})`;if(overlay?.type==='PATTERN_OVERLAY'&&overlay.settings.pattern)return`url(#export-text-pattern-${id})`;const fill=style.fill;if(fill?.type==='LINEAR_GRADIENT')return`url(#export-text-linear-${id})`;if(fill?.type==='RADIAL_GRADIENT')return`url(#export-text-radial-${id})`;return normalizeExportColor(fill?.type==='SOLID'?fill.color:style.color)}
function exportTextFillStyle(style:any):React.CSSProperties{const overlay=exportTextOverlayCss(style as TextDesignElement['style']);if(overlay)return overlay;const fill=style.fill;if(!fill||fill.type==='SOLID')return{color:normalizeExportColor(fill?.color??style.color)};if(fill.type==='LINEAR_GRADIENT'){const stops=fill.gradient.stops.map((stop:any)=>`${normalizeExportColor(stop.color)} ${stop.offset}%`).join(',');return{color:'transparent',backgroundImage:`linear-gradient(${fill.gradient.angleDeg}deg,${stops})`,backgroundClip:'text',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'};}if(fill.type==='RADIAL_GRADIENT'){const stops=fill.gradient.stops.map((stop:any)=>`${normalizeExportColor(stop.color)} ${stop.offset}%`).join(',');return{color:'transparent',backgroundImage:`radial-gradient(circle at ${fill.gradient.centerX}% ${fill.gradient.centerY}%,${stops})`,backgroundClip:'text',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'};}return{color:normalizeExportColor(style.color)};}
function exportTextColorOpacity(color:string,opacity:number){const value=normalizeExportColor(color);const hex=value.replace('#','');if(/^[0-9a-f]{6}$/i.test(hex)){const n=parseInt(hex,16);return `rgba(${n>>16},${n>>8&255},${n&255},${Math.max(0,Math.min(1,opacity))})`}return value}
// @ts-ignore
function exportLayerEffectStroke(style:TextDesignElement['style'],mmToPx:number){const effect=[...(style.layerEffects??[])].reverse().find(item=>item.enabled&&item.type==='STROKE'&&(item.settings.widthMm??0)>0);if(!effect)return undefined;return `${Math.max(.25,(effect.settings.widthMm??0)*mmToPx)}px ${exportTextColorOpacity(effect.settings.color??'#111827',effect.opacity??1)}`}

function exportActiveStrokeEffects(style:TextDesignElement['style']){return (style.layerEffects??[]).filter(effect=>effect.enabled&&effect.type==='STROKE'&&(effect.settings.widthMm??0)>0)}
function exportEffectiveStrokeWidthMm(effect:TextLayerEffect){const width=Math.max(0,effect.settings.widthMm??0);return effect.settings.position==='OUTSIDE'?width*2:effect.settings.position==='INSIDE'?Math.max(.01,width*.8):width}
function exportTextBlendMode(mode?:TextLayerEffect['blendMode']):React.CSSProperties['mixBlendMode']{if(mode==='MULTIPLY')return'multiply';if(mode==='SCREEN')return'screen';if(mode==='OVERLAY')return'overlay';if(mode==='SOFT_LIGHT')return'soft-light';return'normal'}

function exportTextEffects(shadow:any,glow:any,advanced:any,layerEffects?:TextLayerEffect[]){const parts:string[]=[];if(shadow?.enabled)parts.push(normalizeShadow(shadow));if(glow?.enabled){const c=exportTextColorOpacity(glow.color,glow.opacity??1);parts.push(`0 0 ${Math.max(0,glow.blurMm)}mm ${c}`);parts.push(`0 0 ${Math.max(0,glow.blurMm*.45)}mm ${c}`);}if(advanced?.bevel?.enabled){const b=advanced.bevel,d=Math.max(.05,b.depthMm),i=Math.max(0,Math.min(1,b.intensity));parts.push(`${-d}mm ${-d}mm ${Math.max(.02,d*.3)}mm ${exportTextColorOpacity(b.highlightColor,i)}`);parts.push(`${d}mm ${d}mm ${Math.max(.02,d*.35)}mm ${exportTextColorOpacity(b.shadowColor,i)}`);}if(advanced?.highlight?.enabled){const h=advanced.highlight;parts.push(`0 ${h.offsetYmm}mm ${Math.max(0,h.blurMm)}mm ${exportTextColorOpacity(h.color,h.opacity??1)}`);}if(advanced?.innerShadow?.enabled){const v=advanced.innerShadow,c=exportTextColorOpacity(v.color,v.opacity??1);parts.push(`${v.offsetXmm}mm ${v.offsetYmm}mm ${Math.max(0,v.blurMm)}mm ${c}`);parts.push(`${-v.offsetXmm*.45}mm ${-v.offsetYmm*.45}mm ${Math.max(0,v.blurMm*.65)}mm ${c}`);}if(advanced?.innerGlow?.enabled){const v=advanced.innerGlow;parts.push(`0 0 ${Math.max(.02,v.blurMm*.35)}mm ${exportTextColorOpacity(v.color,v.opacity??1)}`);parts.push(`0 0 ${Math.max(.02,v.blurMm*.7)}mm ${exportTextColorOpacity(v.color,(v.opacity??1)*.55)}`);}if(advanced?.secondaryStroke?.enabled){const v=advanced.secondaryStroke,w=Math.max(.02,v.widthMm),c=exportTextColorOpacity(v.color,v.opacity??1);for(const [x,y] of [[-1,0],[1,0],[0,-1],[0,1],[-.7,-.7],[.7,-.7],[-.7,.7],[.7,.7]])parts.push(`${x*w}mm ${y*w}mm 0 ${c}`);}if(advanced?.reflection?.enabled){const v=advanced.reflection;parts.push(`0 ${v.offsetYmm}mm ${Math.max(0,v.blurMm)}mm ${exportTextColorOpacity(v.color,v.opacity??1)}`);}if(advanced?.grain?.enabled&&advanced.grain.amount>0){const v=advanced.grain,a=Math.max(0,Math.min(100,v.amount))/100,spread=.04+.12*a,c=exportTextColorOpacity(v.color,v.opacity??1);for(const [x,y] of [[-.8,-.2],[.65,.15],[-.25,.72],[.3,-.65]])parts.push(`${x*spread}mm ${y*spread}mm 0 ${c}`);}if(advanced?.longShadow?.enabled){const l=advanced.longShadow,distance=Math.max(0,l.distanceMm),steps=Math.max(1,Math.min(12,Math.ceil(distance/.35))),rad=l.angleDeg*Math.PI/180;for(let n=1;n<=steps;n++){const d=distance*n/steps;parts.push(`${Math.cos(rad)*d}mm ${Math.sin(rad)*d}mm 0 ${exportTextColorOpacity(l.color,(l.opacity??1)*(n/steps))}`)}}for(const effect of layerEffects??[]){if(!effect.enabled)continue;const o=effect.opacity??1,v=effect.settings;if(effect.type==='DROP_SHADOW')parts.push(`${v.offsetXmm??.5}mm ${v.offsetYmm??.5}mm ${Math.max(0,v.blurMm??.6)}mm ${exportTextColorOpacity(v.color??'#111827',o)}`);else if(effect.type==='OUTER_GLOW'){const c=exportTextColorOpacity(v.color??'#60a5fa',o),b=Math.max(0,v.blurMm??1.5);parts.push(`0 0 ${b}mm ${c}`);parts.push(`0 0 ${Math.max(.02,b*.45)}mm ${c}`)}else if(effect.type==='INNER_SHADOW'){const c=exportTextColorOpacity(v.color??'#111827',o),x=v.offsetXmm??.2,y=v.offsetYmm??.2,b=Math.max(0,v.blurMm??.4);parts.push(`${x}mm ${y}mm ${b}mm ${c}`)}else if(effect.type==='INNER_GLOW'){const c=exportTextColorOpacity(v.color??'#ffffff',o),b=Math.max(0,v.blurMm??.8);parts.push(`0 0 ${Math.max(.02,b*.55)}mm ${c}`)}else if(effect.type==='SATIN'){const angle=(v.angleDeg??19)*Math.PI/180,d=Math.max(0,v.distanceMm??.8),size=Math.max(.02,v.sizeMm??1.2),inv=v.satinInvert?-1:1,c=exportTextColorOpacity(v.color??'#111827',o),x=Math.cos(angle)*d*inv,y=Math.sin(angle)*d*inv;parts.push(`${x}mm ${y}mm ${size}mm ${c}`);parts.push(`${-x}mm ${-y}mm ${Math.max(.02,size*.65)}mm ${exportTextColorOpacity(v.color??'#111827',o*.65)}`)}else if(effect.type==='BEVEL_EMBOSS'){const size=Math.max(.02,v.sizeMm??v.depthMm??.35),depth=Math.max(.01,size*Math.max(1,v.depthPct??100)/100),dir=v.direction==='DOWN'?-1:1,angle=(v.angleDeg??120)*Math.PI/180,alt=Math.max(0,Math.min(90,v.altitudeDeg??30))*Math.PI/180,styleFactor=v.bevelStyle==='OUTER_BEVEL'?1.2:v.bevelStyle==='EMBOSS'?1.35:v.bevelStyle==='PILLOW_EMBOSS'?0.85:v.bevelStyle==='STROKE_EMBOSS'?0.7:1,offset=Math.max(.02,depth*Math.max(.2,Math.cos(alt))*styleFactor),x=Math.cos(angle)*offset*dir,y=-Math.sin(angle)*offset*dir,tech=v.bevelTechnique??'SMOOTH',blur=tech==='CHISEL_HARD'?0:Math.max(.01,(v.softenMm??.1)*(tech==='CHISEL_SOFT'?1.6:1)),contour=v.glossContour??'LINEAR',contourBoost=(v.contourStrength??1)*(contour==='CONE'?1.15:contour==='CONE_INVERTED'?0.9:contour==='RING'?1.25:contour==='GAUSSIAN'?0.8:contour==='DOUBLE_RING'?1.35:contour==='ROUNDED_STEPS'?1.1:1),hi=o*(v.highlightOpacity??.75)*contourBoost,sh=o*(v.shadowOpacity??.75);parts.push(`${-x}mm ${-y}mm ${blur}mm ${exportTextColorOpacity(v.highlightColor??'#ffffff',Math.min(1,hi))}`);parts.push(`${x}mm ${y}mm ${blur}mm ${exportTextColorOpacity(v.shadowColor??'#111827',Math.min(1,sh))}`);const td=Math.abs(v.textureDepth??0);if(td>0){const sign=v.textureInvert?-1:1,tc=exportTextColorOpacity(sign>0?(v.highlightColor??'#ffffff'):(v.shadowColor??'#111827'),Math.min(.45,td*.4*o)),scale=(v.texturePattern?.scale??8)/100;for(const [tx,ty] of [[-.7,-.25],[.55,.2],[-.15,.65],[.35,-.6]])parts.push(`${tx*scale}mm ${ty*scale}mm 0 ${tc}`)}}}return parts.length?parts.join(', '):undefined;}

function normalizeStroke(stroke: DesignStroke | undefined, mmToPx: number): string {
  if (!stroke || !stroke.widthMm || stroke.style === 'NONE') return 'none';
  const style=stroke.style==='DOTTED'?'dotted':stroke.style==='DASHED'||stroke.style==='CUSTOM'?'dashed':'solid';
  return `${stroke.widthMm * mmToPx}px ${style} ${normalizeExportColor(stroke.color)}`;
}

export function IsolatedCardExportCanvas({ artboard, assets }: { artboard: Artboard, assets: DesignTemplate['sharedAssets'] }) {
  const MM_TO_CSS_PX = 96 / 25.4;
  const clean=artboard.id.replace(/[^a-zA-Z0-9_-]/g,'');
  const ids={linear:`export-artboard-gradient-${clean}`,radial:`export-artboard-radial-${clean}`,pattern:`export-artboard-pattern-${clean}`,image:`export-artboard-image-${clean}`};
  const backgroundPaint=exportVectorFillPaint(artboard.background,ids);
  const backgroundOpacity=exportVectorFillOpacity(artboard.background);

  const canvasStyle: React.CSSProperties = {
    width: `${artboard.widthMm * MM_TO_CSS_PX}px`,
    height: `${artboard.heightMm * MM_TO_CSS_PX}px`,
    position: 'relative',
    overflow: 'hidden',
    boxSizing: 'border-box'
  };

  return (
    <div data-artboard-id={artboard.id} style={canvasStyle}>
      <svg data-export-artboard-background width="100%" height="100%" viewBox={`0 0 ${artboard.widthMm} ${artboard.heightMm}`} preserveAspectRatio="none" style={{position:'absolute',inset:0,zIndex:0,pointerEvents:'none'}}>
        <ExportVectorFillDefs fill={artboard.background} ids={ids} assets={assets} width={artboard.widthMm} height={artboard.heightMm}/>
        <rect x="0" y="0" width={artboard.widthMm} height={artboard.heightMm} fill={backgroundPaint} fillOpacity={backgroundOpacity}/>
      </svg>
      {[...artboard.elements].sort((a,b)=>a.zIndex-b.zIndex||a.id.localeCompare(b.id)).filter(e => !e.runtimeHidden && e.metadata?.cadExport !== false && e.metadata?.cadConstruction !== true).map(e => (
        <IsolatedExportElement key={e.id} element={e} assets={assets} mmToPx={MM_TO_CSS_PX} artboard={artboard} />
      ))}
    </div>
  );
}

export function resolveDesignElementGeometry(e: DesignElement) {
  return {
    xMm: e.position.xMm,
    yMm: e.position.yMm,
    widthMm: e.size.widthMm,
    heightMm: e.size.heightMm,
    rotation: e.rotationDeg,
    flipX: e.type === 'IMAGE' || e.type === 'SVG' ? (e as any).flipX : false,
    flipY: e.type === 'IMAGE' || e.type === 'SVG' ? (e as any).flipY : false,
  };
}

function forceSvgFit(dataUri: string): string {
  if (!dataUri.startsWith('data:image/svg+xml')) return dataUri;
  const isBase64 = dataUri.includes(';base64,');
  const content = dataUri.substring(dataUri.indexOf(',') + 1);
  if (!content) return dataUri;
  try {
    let svg = isBase64 ? atob(content) : decodeURIComponent(content);
    svg = svg.replace(/<svg\b([^>]*)>/i, (_match, attrs) => {
      const clean = String(attrs).replace(/\s(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
      return `<svg${clean} width="100%" height="100%">`;
    });
    return `data:image/svg+xml;${isBase64 ? 'base64,' + btoa(svg) : 'utf8,' + encodeURIComponent(svg)}`;
  } catch (e) {
    return dataUri;
  }
}

function IsolatedExportElement({ element, assets, mmToPx, artboard }: { element: DesignElement, assets: DesignTemplate['sharedAssets'], mmToPx: number, artboard: Artboard }) {
  const e = element;
  const geom = resolveDesignElementGeometry(e);
  const pathRasterBounds = e.type === 'PATH' ? resolvePathRasterBounds(e as PathDesignElement) : undefined;
  const shellGeom = pathRasterBounds
    ? { ...geom, xMm: pathRasterBounds.xMm, yMm: pathRasterBounds.yMm, widthMm: pathRasterBounds.widthMm, heightMm: pathRasterBounds.heightMm }
    : geom;
  
  const shellStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${shellGeom.xMm * mmToPx}px`,
    top: `${shellGeom.yMm * mmToPx}px`,
    width: `${shellGeom.widthMm * mmToPx}px`,
    height: `${shellGeom.heightMm * mmToPx}px`,
    transform: `rotate(${geom.rotation}deg)`,
    opacity: e.opacity,
    zIndex: e.zIndex + 1,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none'
  };

  let content: React.ReactNode = null;

  if (e.type === 'TEXT') {
    const displayText=exportTextCase(e.text,e.style.textCase);
    const fontSizePt=exportAutoFitFontPt(displayText,e);
    const textPath=e.style.textPath;
    if(textPath&&textPath.mode!=='BOX'){
      const clean=e.id.replace(/[^a-zA-Z0-9_-]/g,'');
      const pathInfo=exportTextPathInfo(e,artboard);
      const fill=exportTextPathFill(e.style,clean);
      const pathStrokes=exportActiveStrokeEffects(e.style);content=(<svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:'100%',height:'100%',overflow:'visible'}}><ExportTextPathPaint style={e.style} id={clean}/><path id={`export-text-path-${clean}`} d={pathInfo.d} transform={pathInfo.transform} fill="none" stroke="none"/>{pathStrokes.map(layer=><text key={layer.id} aria-hidden="true" fontFamily={e.style.fontFamily} fontSize={Math.max(1,fontSizePt)*100/Math.max(1,e.size.heightMm*2.83465)} fontWeight={e.style.fontWeight} fontStyle={e.style.italic?'italic':'normal'} letterSpacing={e.style.letterSpacingPt*100/Math.max(1,e.size.widthMm*2.83465)} fill="transparent" stroke={exportTextColorOpacity(layer.settings.color??'#111827',layer.opacity??1)} strokeWidth={Math.max(.2,exportEffectiveStrokeWidthMm(layer)*100/Math.max(1,e.size.widthMm))} strokeLinejoin="round" paintOrder="stroke"><textPath href={`#export-text-path-${clean}`} startOffset={`${textPath.startOffsetPct??50}%`} textAnchor="middle">{renderExportRichTextSvg(displayText,e.style)}</textPath></text>)}<text fontFamily={e.style.fontFamily} fontSize={Math.max(1,fontSizePt)*100/Math.max(1,e.size.heightMm*2.83465)} fontWeight={e.style.fontWeight} fontStyle={e.style.italic?'italic':'normal'} letterSpacing={e.style.letterSpacingPt*100/Math.max(1,e.size.widthMm*2.83465)} fill={fill} stroke={!pathStrokes.length&&e.style.stroke&&e.style.stroke.widthMm>0?normalizeExportColor(e.style.stroke.color):undefined} strokeWidth={!pathStrokes.length&&e.style.stroke&&e.style.stroke.widthMm>0?Math.max(.2,e.style.stroke.widthMm*100/Math.max(1,e.size.widthMm)):undefined} style={{filter:exportTextEffects((e as any).shadow,e.style.glow,e.style.advancedEffects,e.style.layerEffects)?`drop-shadow(${exportTextEffects((e as any).shadow,e.style.glow,e.style.advancedEffects,e.style.layerEffects)?.split(',')[0]})`:undefined}}><textPath href={`#export-text-path-${clean}`} startOffset={`${textPath.startOffsetPct??50}%`} textAnchor="middle">{renderExportRichTextSvg(displayText,e.style)}</textPath></text></svg>);
    }else{
      const paint=exportTextFillStyle(e.style);
      const strokeLayers=exportActiveStrokeEffects(e.style);
      const outline=!strokeLayers.length&&e.style.stroke&&e.style.stroke.widthMm>0?`${Math.max(.25,e.style.stroke.widthMm*mmToPx)}px ${normalizeExportColor(e.style.stroke.color)}`:undefined;
      content = (
        <div style={{
          fontFamily: e.style.fontFamily,
          fontSize: `${fontSizePt}pt`,
          fontWeight: e.style.fontWeight,
          fontStyle: e.style.italic ? 'italic' : 'normal',
          textDecoration: [e.style.underline?'underline':'',e.style.strikethrough?'line-through':''].filter(Boolean).join(' ')||'none',
          textAlign: (e.style.paragraphAlignment??e.style.alignment).toLowerCase() as any,
          lineHeight: e.style.lineHeight,
          letterSpacing: `${e.style.letterSpacingPt}pt`,
          textShadow: exportTextEffects((e as any).shadow,e.style.glow,e.style.advancedEffects,e.style.layerEffects),
          padding: `${Math.max(0,e.style.paddingMm??0)*mmToPx}px`,
          display:'flex',
          alignItems:e.style.verticalAlignment==='CENTER'?'center':e.style.verticalAlignment==='BOTTOM'?'flex-end':'flex-start',
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          WebkitTextStroke:outline,
          ...paint
        }}><span style={{width:'100%',position:'relative',display:'block',isolation:'isolate'}}>{strokeLayers.map((layer,index)=><span key={layer.id} aria-hidden="true" style={{position:'absolute',inset:0,width:'100%',color:'transparent',WebkitTextFillColor:'transparent',WebkitTextStroke:`${Math.max(.25,exportEffectiveStrokeWidthMm(layer)*mmToPx)}px ${normalizeExportColor(layer.settings.color??'#111827')}`,opacity:layer.opacity??1,mixBlendMode:exportTextBlendMode(layer.blendMode),zIndex:index,pointerEvents:'none',textShadow:'none',whiteSpace:'inherit',wordBreak:'inherit'}}>{renderExportRichTextHtml(displayText,e.style)}</span>)}<span style={{position:'relative',zIndex:100,width:'100%',display:'block'}}>{renderExportRichTextHtml(displayText,e.style)}</span></span></div>
      );
    }
  } else if (e.type === 'SHAPE') {
    const clean=e.id.replace(/[^a-zA-Z0-9_-]/g,'');
    const ids={linear:`export-linear-${clean}`,radial:`export-radial-${clean}`,pattern:`export-pattern-${clean}`,image:`export-image-${clean}`};
    const fill=exportVectorFillPaint(e.fill,ids),fillOpacity=exportVectorFillOpacity(e.fill),strokeProps=exportVectorStrokeProps(e.stroke,mmToPx);
    const sw=e.stroke.style==='NONE'?0:e.stroke.widthMm*mmToPx;
    const shadow='shadow' in e?normalizeShadow((e as any).shadow):'none';
    const common={fill,fillOpacity,strokeWidth:sw,...strokeProps,vectorEffect:'non-scaling-stroke' as const};
    let shapeNode:React.ReactNode;
    if(e.shape==='ROUNDED_RECTANGLE')shapeNode=<rect x="1" y="1" width="98" height="98" rx={Math.min(48,(e.cornerRadiusMm??3)*4)} ry={Math.min(48,(e.cornerRadiusMm??3)*4)} {...common}/>;
    else if(e.shape==='LINE')shapeNode=<line x1="2" y1="50" x2="98" y2="50" {...common} fill="none"/>;
    else {const geometry=shapeToPathGeometry(e.shape,{widthMm:100,heightMm:100});shapeNode=<path d={geometryToSvgPath(geometry)} {...common} fill={geometry.closed?fill:'none'}/>;}
    const shapeLabel=e.label?.enabled?e.label:undefined;
    content=(<div style={{position:'relative',width:'100%',height:'100%'}}><svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:'absolute',inset:0,filter:shadow!=='none'?`drop-shadow(${shadow})`:undefined,overflow:'visible',transform:`scale(${e.flipX?-1:1},${e.flipY?-1:1})`}}><ExportVectorFillDefs fill={e.fill} ids={ids} assets={assets} width={100} height={100}/>{shapeNode}</svg>{shapeLabel&&<div style={{position:'absolute',inset:`${shapeLabel.paddingMm*mmToPx}px`,display:'flex',alignItems:shapeLabel.verticalAlignment==='TOP'?'flex-start':shapeLabel.verticalAlignment==='BOTTOM'?'flex-end':'center',justifyContent:shapeLabel.alignment==='LEFT'?'flex-start':shapeLabel.alignment==='RIGHT'?'flex-end':'center',overflow:'hidden',fontFamily:shapeLabel.fontFamily,fontSize:`${shapeLabel.fontSizePt}pt`,fontWeight:shapeLabel.fontWeight,fontStyle:shapeLabel.italic?'italic':'normal',textDecoration:shapeLabel.underline?'underline':'none',color:normalizeExportColor(shapeLabel.color),lineHeight:shapeLabel.lineHeight,textAlign:shapeLabel.alignment.toLowerCase() as any,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{shapeLabel.text}</div>}</div>);
  } else if (e.type === 'PATH') {
    const pathElement=e as PathDesignElement,clean=pathElement.id.replace(/[^a-zA-Z0-9_-]/g,'');
    const ids={linear:`export-linear-${clean}`,radial:`export-radial-${clean}`,pattern:`export-pattern-${clean}`,image:`export-image-${clean}`};
    const fill=exportVectorFillPaint(pathElement.fill,ids),fillOpacity=exportVectorFillOpacity(pathElement.fill),strokeProps=exportVectorStrokeProps(pathElement.stroke,1);
    const rasterBounds=pathRasterBounds ?? resolvePathRasterBounds(pathElement),shadow=normalizeShadow(pathElement.shadow),pathLabel=pathElement.label?.enabled?pathElement.label:undefined;
    const labelOffsetPx=rasterBounds.contentOffsetMm*mmToPx;
    content=(<div style={{position:'relative',width:'100%',height:'100%'}}><svg data-export-path-id={pathElement.id} width="100%" height="100%" viewBox={`${rasterBounds.viewBoxX} ${rasterBounds.viewBoxY} ${rasterBounds.viewBoxWidthMm} ${rasterBounds.viewBoxHeightMm}`} preserveAspectRatio="none" style={{position:'absolute',inset:0,overflow:'visible',filter:shadow!=='none'?`drop-shadow(${shadow})`:undefined}}><ExportVectorFillDefs fill={pathElement.fill} ids={ids} assets={assets} width={rasterBounds.viewBoxWidthMm} height={rasterBounds.viewBoxHeightMm}/><path d={geometryToSvgPath(pathElement.geometry)} fill={fill} fillOpacity={fillOpacity} strokeWidth={pathElement.stroke.style==='NONE'?0:pathElement.stroke.widthMm} {...strokeProps} vectorEffect="non-scaling-stroke"/></svg>{pathLabel&&<div style={{position:'absolute',left:labelOffsetPx,top:labelOffsetPx,width:`${pathElement.size.widthMm*mmToPx}px`,height:`${pathElement.size.heightMm*mmToPx}px`,padding:`${pathLabel.paddingMm*mmToPx}px`,boxSizing:'border-box',display:'flex',alignItems:pathLabel.verticalAlignment==='TOP'?'flex-start':pathLabel.verticalAlignment==='BOTTOM'?'flex-end':'center',justifyContent:pathLabel.alignment==='LEFT'?'flex-start':pathLabel.alignment==='RIGHT'?'flex-end':'center',overflow:'hidden',fontFamily:pathLabel.fontFamily,fontSize:`${pathLabel.fontSizePt}pt`,fontWeight:pathLabel.fontWeight,fontStyle:pathLabel.italic?'italic':'normal',textDecoration:pathLabel.underline?'underline':'none',color:normalizeExportColor(pathLabel.color),lineHeight:pathLabel.lineHeight,textAlign:pathLabel.alignment.toLowerCase() as any,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{pathLabel.text}</div>}</div>);
  } else if (e.type === 'IMAGE') {
    const source = resolveRasterImageElementSource(e, assets);
    if (source) {
      content = (
        <img 
          src={source} 
          alt={e.name} 
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: e.fit === 'FIT' ? 'contain' : e.fit === 'FILL' ? 'cover' : 'fill',
            transform: `scale(${geom.flipX ? -1 : 1}, ${geom.flipY ? -1 : 1})`,
            borderRadius: e.cornerRadiusMm ? `${e.cornerRadiusMm * mmToPx}px` : 0,
            border: normalizeStroke(e.stroke, mmToPx),
            boxShadow: 'shadow' in e ? normalizeShadow((e as any).shadow) : undefined,
            boxSizing: 'border-box'
          }} 
        />
      );
    }
  } else if (e.type === 'SVG') {
    const asset = assets.find(a => a.id === e.assetId);
    if (asset && asset.source) {
      const tinted = asset.metadata?.recolorable === true && e.tintColor;
      const border = normalizeStroke(e.stroke, mmToPx);
      const shadow = 'shadow' in e ? normalizeShadow((e as any).shadow) : 'none';
      let inlineSvg = '';
      if (asset.source.startsWith('data:image/svg+xml')) {
        const isBase64 = asset.source.includes(';base64,');
        const contentStr = asset.source.substring(asset.source.indexOf(',') + 1);
        if (contentStr) {
          try {
            let svg = isBase64 ? atob(contentStr) : decodeURIComponent(contentStr);
            // Replace width/height with 100%
            svg = svg.replace(/<svg\b([^>]*)>/i, (_match, attrs) => {
              const clean = String(attrs).replace(/\s(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
              return `<svg${clean} width="100%" height="100%">`;
            });
            // Normalize colors
            if (tinted && e.tintColor) {
               const tc = normalizeExportColor(e.tintColor);
               // Replace all fill/stroke except none with tintColor
               svg = svg.replace(/\s(fill|stroke)\s*=\s*(?:"[^"]*"|'[^']*')/gi, (m, attr) => {
                 if (m.includes('none')) return m;
                 return ` ${attr}="${tc}"`;
               });
               svg = svg.replace(/<svg\b/i, `<svg fill="${tc}" color="${tc}" `);
            } else {
               // Replace currentColor and var(--...) with #000 or their resolved values if possible, 
               // but since we don't have CSS context, we just strip color() and var() functions
               svg = svg.replace(/\s(fill|stroke|color|stop-color)\s*=\s*["']([^"']+)["']/gi, (m, attr, val) => {
                 if (val.includes('var(') || val === 'currentColor') return ` ${attr}="#000000"`;
                 if (val.includes('color(')) return ` ${attr}="${normalizeExportColor(val)}"`;
                 return m;
               });
            }
            inlineSvg = svg;
          } catch (err) {
            // fallback
          }
        }
      }

      const style: React.CSSProperties = {
        width: '100%', height: '100%', 
        border,
        filter: shadow !== 'none' ? `drop-shadow(${shadow})` : undefined,
        transform: `scale(${geom.flipX ? -1 : 1}, ${geom.flipY ? -1 : 1})`,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      };

      if (inlineSvg) {
        content = <div style={style} dangerouslySetInnerHTML={{ __html: inlineSvg }} />;
      } else if (tinted) {
        content = (
          <div style={{
            ...style,
            backgroundColor: normalizeExportColor(e.tintColor),
            maskImage: `url("${forceSvgFit(asset.source)}")`,
            WebkitMaskImage: `url("${forceSvgFit(asset.source)}")`,
            maskSize: 'contain',
            WebkitMaskSize: 'contain',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskPosition: 'center',
          }} />
        );
      } else {
        content = (
          <img 
            src={forceSvgFit(asset.source)} 
            alt={e.name} 
            style={{ ...style, objectFit: 'contain' }} 
          />
        );
      }
    }
  } else if (e.type === 'QR') {
      const qr = e as QrDesignElement;
      const value = qr.value || "QR";
      const size = Math.min(geom.widthMm, geom.heightMm) * mmToPx;
      content = (
        <div style={{
          width: '100%', height: '100%', 
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          filter: 'shadow' in e && normalizeShadow((e as any).shadow) !== 'none' ? `drop-shadow(${normalizeShadow((e as any).shadow)})` : undefined
        }}>
          <QRCode 
            value={value} 
            size={size} 
            fgColor={qr.foreground} 
            bgColor={qr.background} 
            level={qr.errorCorrection} 
            style={{height: "auto", maxWidth: "100%", width: "100%"}} 
          />
        </div>
      );
    }

  return (
    <div data-element-id={e.id} style={shellStyle}>
      {content}
    </div>
  );
}

function exportVectorFillPaint(fill:DesignFill,ids:{linear:string;radial:string;pattern:string;image:string}){
 if(fill.type==='SOLID')return normalizeExportColor(fill.color);
 if(fill.type==='LINEAR_GRADIENT')return `url(#${ids.linear})`;
 if(fill.type==='RADIAL_GRADIENT')return `url(#${ids.radial})`;
 if(fill.type==='PATTERN')return `url(#${ids.pattern})`;
 if(fill.type==='IMAGE')return `url(#${ids.image})`;
 return 'transparent';
}
function exportVectorFillOpacity(fill:DesignFill){return fill.type==='SOLID'||fill.type==='IMAGE'?(fill.opacity??1):1;}
function exportVectorStrokeProps(stroke:DesignStroke,unitScale:number){
 const dash=normalizeStrokeDashArray(stroke)?.map(value=>value*unitScale).join(' ');
 return {stroke:stroke.style==='NONE'?'none':normalizeExportColor(stroke.color),strokeOpacity:stroke.opacity??1,strokeDasharray:dash,strokeDashoffset:(stroke.dashOffset??0)*unitScale,strokeLinecap:(stroke.lineCap??'BUTT').toLowerCase() as 'butt'|'round'|'square',strokeLinejoin:(stroke.lineJoin??'MITER').toLowerCase() as 'miter'|'round'|'bevel',strokeMiterlimit:stroke.miterLimit??4};
}
function ExportPatternFillDef({id,fill}:{id:string;fill:Extract<DesignFill,{type:'PATTERN'}>}){
 const p=fill.pattern,size=Math.max(.025,.12*p.scale),opacity=p.opacity??1;
 return <pattern id={id} patternUnits="objectBoundingBox" width={size} height={size} viewBox="0 0 10 10" preserveAspectRatio="none" patternTransform={`rotate(${p.rotationDeg})`}><rect x="0" y="0" width="10" height="10" fill={normalizeExportColor(p.background)}/>{p.kind==='HATCH'&&<path d="M 0 10 L 10 0" stroke={normalizeExportColor(p.foreground)} strokeOpacity={opacity} strokeWidth="0.8"/>}{p.kind==='DOT'&&<circle cx="5" cy="5" r="1.6" fill={normalizeExportColor(p.foreground)} fillOpacity={opacity}/>} {p.kind==='CHECKER'&&<><rect x="0" y="0" width="5" height="5" fill={normalizeExportColor(p.foreground)} fillOpacity={opacity}/><rect x="5" y="5" width="5" height="5" fill={normalizeExportColor(p.foreground)} fillOpacity={opacity}/></>}</pattern>;
}
function ExportVectorFillDefs({fill,ids,assets,width,height}:{fill:DesignFill;ids:{linear:string;radial:string;pattern:string;image:string};assets:DesignTemplate['sharedAssets'];width:number;height:number}){
 return <defs>{fill.type==='LINEAR_GRADIENT'&&<linearGradient id={ids.linear} gradientTransform={`rotate(${fill.gradient.angleDeg} .5 .5)`}>{fill.gradient.stops.map((stop,index)=><stop key={index} offset={`${stop.offset}%`} stopColor={normalizeExportColor(stop.color)} stopOpacity={stop.opacity??1}/>)}</linearGradient>}{fill.type==='RADIAL_GRADIENT'&&<radialGradient id={ids.radial} cx={`${fill.gradient.centerX}%`} cy={`${fill.gradient.centerY}%`} r={`${fill.gradient.radius}%`} fx={`${fill.gradient.focalX??fill.gradient.centerX}%`} fy={`${fill.gradient.focalY??fill.gradient.centerY}%`}>{fill.gradient.stops.map((stop,index)=><stop key={index} offset={`${stop.offset}%`} stopColor={normalizeExportColor(stop.color)} stopOpacity={stop.opacity??1}/>)}</radialGradient>}{fill.type==='PATTERN'&&<ExportPatternFillDef id={ids.pattern} fill={fill}/>} {fill.type==='IMAGE'&&<ExportImageFillPattern id={ids.image} fill={fill} assets={assets} width={width} height={height}/>}</defs>;
}
function ExportImageFillPattern({id,fill,assets,width,height}:{id:string;fill:Extract<DesignFill,{type:'IMAGE'}>;assets:DesignTemplate['sharedAssets'];width:number;height:number}){
  const source=resolveRasterImageFillSource(fill,assets);if(!source)return null;
  const preserveAspectRatio=fill.fit==='FIT'?'xMidYMid meet':fill.fit==='FILL'?'xMidYMid slice':'none';
  const t=normalizeImageFillTransform(fill.transform),cx=width/2,cy=height/2,dx=t.offsetX/100*width,dy=t.offsetY/100*height;
  const transform=`translate(${cx+dx} ${cy+dy}) rotate(${t.rotationDeg}) scale(${t.scale}) translate(${-cx} ${-cy})`;
  return <pattern id={id} patternUnits="userSpaceOnUse" width={width} height={height}><image href={source} x="0" y="0" width={width} height={height} preserveAspectRatio={preserveAspectRatio} transform={transform}/></pattern>;
}

