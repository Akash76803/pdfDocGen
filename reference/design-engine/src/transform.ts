import type { Artboard, DesignElement, DesignPoint, DesignSize, DesignTemplate, PathDesignElement } from '@document-tool/contracts';
import { scalePathGeometry } from './pathUtils.js';

export const DEFAULT_MIN_ELEMENT_SIZE_MM = 0.5;
export const DEFAULT_NUDGE_MM = 0.5;
export const DEFAULT_LARGE_NUDGE_MM = 5;
export const DEFAULT_ROTATION_SNAP_DEG = 15;

export type ResizeAnchor = 'NW'|'N'|'NE'|'E'|'SE'|'S'|'SW'|'W';
export interface DesignRectMm { xMm:number; yMm:number; widthMm:number; heightMm:number; }
export interface ResizeElementOptions {
  anchor?: ResizeAnchor;
  maintainAspectRatio?: boolean;
  minSizeMm?: number;
  /** Keep the visual center fixed while resizing (Alt/Option-style resize). */
  centerBased?: boolean;
}

function updateArtboard(template:DesignTemplate, artboardId:string, updater:(artboard:Artboard)=>Artboard):DesignTemplate {
  return {...template,artboards:template.artboards.map(a=>a.id===artboardId?updater(a):a)};
}

export function normalizeRotationDeg(value:number):number {
  if(!Number.isFinite(value)) return 0;
  const normalized=((value%360)+360)%360;
  return Math.abs(normalized-360)<1e-9?0:normalized;
}

export function snapRotationDeg(value:number, incrementDeg=DEFAULT_ROTATION_SNAP_DEG):number {
  if(!Number.isFinite(value)) return 0;
  if(!Number.isFinite(incrementDeg)||incrementDeg<=0) return normalizeRotationDeg(value);
  return normalizeRotationDeg(Math.round(value/incrementDeg)*incrementDeg);
}

export function getElementRect(element:DesignElement):DesignRectMm {
  return {xMm:element.position.xMm,yMm:element.position.yMm,widthMm:element.size.widthMm,heightMm:element.size.heightMm};
}

export function elementContainsPoint(element:DesignElement, point:DesignPoint):boolean {
  // Preserve the historical selection policy: hit testing remains layout-box based.
  // Resize math itself is rotation-aware in Phase 8.1.
  const r=getElementRect(element);
  return point.xMm>=r.xMm&&point.xMm<=r.xMm+r.widthMm&&point.yMm>=r.yMm&&point.yMm<=r.yMm+r.heightMm;
}

export function rectIntersects(a:DesignRectMm,b:DesignRectMm):boolean {
  return a.xMm<=b.xMm+b.widthMm&&a.xMm+a.widthMm>=b.xMm&&a.yMm<=b.yMm+b.heightMm&&a.yMm+a.heightMm>=b.yMm;
}

export function getSelectionBounds(elements:DesignElement[]):DesignRectMm|null {
  const visible=elements.filter(e=>e.visible);
  if(!visible.length)return null;
  const minX=Math.min(...visible.map(e=>e.position.xMm));
  const minY=Math.min(...visible.map(e=>e.position.yMm));
  const maxX=Math.max(...visible.map(e=>e.position.xMm+e.size.widthMm));
  const maxY=Math.max(...visible.map(e=>e.position.yMm+e.size.heightMm));
  return {xMm:minX,yMm:minY,widthMm:maxX-minX,heightMm:maxY-minY};
}

export function moveElements(template:DesignTemplate,artboardId:string,elementIds:readonly string[],delta:DesignPoint):DesignTemplate {
  if(!Number.isFinite(delta.xMm)||!Number.isFinite(delta.yMm))return template;
  const ids=new Set(elementIds);
  return updateArtboard(template,artboardId,a=>({...a,elements:a.elements.map(e=>ids.has(e.id)&&!e.locked?{...e,position:{xMm:e.position.xMm+delta.xMm,yMm:e.position.yMm+delta.yMm}}:e)}));
}

export function setElementPosition(template:DesignTemplate,artboardId:string,elementId:string,position:DesignPoint):DesignTemplate {
  if(!Number.isFinite(position.xMm)||!Number.isFinite(position.yMm))return template;
  return updateArtboard(template,artboardId,a=>({...a,elements:a.elements.map(e=>e.id===elementId&&!e.locked?{...e,position:{...position}}:e)}));
}

/** Convert a pointer delta in artboard/world axes to the element's local rotated axes. */
export function worldDeltaToElementLocal(delta:DesignPoint, rotationDeg:number):DesignPoint {
  const radians=-normalizeRotationDeg(rotationDeg)*Math.PI/180;
  const cos=Math.cos(radians),sin=Math.sin(radians);
  return {
    xMm:delta.xMm*cos-delta.yMm*sin,
    yMm:delta.xMm*sin+delta.yMm*cos,
  };
}

function anchorVector(size:DesignSize, anchor:ResizeAnchor):DesignPoint {
  const x=anchor.includes('W')?-size.widthMm/2:anchor.includes('E')?size.widthMm/2:0;
  const y=anchor.includes('N')?-size.heightMm/2:anchor.includes('S')?size.heightMm/2:0;
  return {xMm:x,yMm:y};
}

function oppositeAnchor(anchor:ResizeAnchor):ResizeAnchor {
  const map:Record<ResizeAnchor,ResizeAnchor>={NW:'SE',N:'S',NE:'SW',E:'W',SE:'NW',S:'N',SW:'NE',W:'E'};
  return map[anchor];
}

function rotateVector(vector:DesignPoint, rotationDeg:number):DesignPoint {
  const radians=normalizeRotationDeg(rotationDeg)*Math.PI/180;
  const cos=Math.cos(radians),sin=Math.sin(radians);
  return {xMm:vector.xMm*cos-vector.yMm*sin,yMm:vector.xMm*sin+vector.yMm*cos};
}

function positionForResize(element:DesignElement,size:DesignSize,anchor:ResizeAnchor,centerBased:boolean):DesignPoint {
  const oldCenter={xMm:element.position.xMm+element.size.widthMm/2,yMm:element.position.yMm+element.size.heightMm/2};
  if(centerBased)return {xMm:oldCenter.xMm-size.widthMm/2,yMm:oldCenter.yMm-size.heightMm/2};

  // Keep the handle opposite the dragged handle fixed in world space. This is
  // equivalent to the old axis-aligned behavior at 0deg, but remains stable
  // for rotated objects.
  const fixedAnchor=oppositeAnchor(anchor);
  const oldOffset=rotateVector(anchorVector(element.size,fixedAnchor),element.rotationDeg);
  const fixedWorld={xMm:oldCenter.xMm+oldOffset.xMm,yMm:oldCenter.yMm+oldOffset.yMm};
  const newOffset=rotateVector(anchorVector(size,fixedAnchor),element.rotationDeg);
  const newCenter={xMm:fixedWorld.xMm-newOffset.xMm,yMm:fixedWorld.yMm-newOffset.yMm};
  return {xMm:newCenter.xMm-size.widthMm/2,yMm:newCenter.yMm-size.heightMm/2};
}

export function resizeElement(template:DesignTemplate,artboardId:string,elementId:string,size:DesignSize,options:ResizeElementOptions={}):DesignTemplate {
  const min=Math.max(0.001,options.minSizeMm??DEFAULT_MIN_ELEMENT_SIZE_MM);
  if(!Number.isFinite(size.widthMm)||!Number.isFinite(size.heightMm))return template;
  return updateArtboard(template,artboardId,a=>({...a,elements:a.elements.map(e=>{
    if(e.id!==elementId||e.locked)return e;
    let width=Math.max(min,size.widthMm),height=Math.max(min,size.heightMm);
    const keep=options.maintainAspectRatio??(e.type==='IMAGE'&&e.maintainAspectRatio===true);
    if(keep&&e.size.widthMm>0&&e.size.heightMm>0){
      const ratio=e.size.widthMm/e.size.heightMm;
      const widthChange=Math.abs(width-e.size.widthMm)/Math.max(e.size.widthMm,1e-9);
      const heightChange=Math.abs(height-e.size.heightMm)/Math.max(e.size.heightMm,1e-9);
      if(widthChange>=heightChange)height=Math.max(min,width/ratio);else width=Math.max(min,height*ratio);
    }
    const anchor=options.anchor??'SE';
    const nextSize={widthMm:width,heightMm:height};
    const position=positionForResize(e,nextSize,anchor,options.centerBased===true);

    if(e.type==='PATH'&&e.size.widthMm>0&&e.size.heightMm>0){
      const scaleX=width/e.size.widthMm;
      const scaleY=height/e.size.heightMm;
      return {...e,position,size:nextSize,geometry:scalePathGeometry((e as PathDesignElement).geometry,scaleX,scaleY)};
    }
    return {...e,position,size:nextSize};
  })}));
}


export interface ResizeSelectionOptions {
  anchor: ResizeAnchor;
  maintainAspectRatio?: boolean;
  centerBased?: boolean;
  minSizeMm?: number;
}

/** Compute the selection bounds produced by a drag delta. The bounds are axis-aligned
 * in artboard space; selected elements retain their own rotations while their layout
 * positions/sizes scale as one set. */
export function resizeSelectionBoundsFromDelta(
  bounds:DesignRectMm,
  anchor:ResizeAnchor,
  delta:DesignPoint,
  options:Omit<ResizeSelectionOptions,'anchor'>={}
):DesignRectMm {
  const min=Math.max(0.001,options.minSizeMm??DEFAULT_MIN_ELEMENT_SIZE_MM);
  const centerBased=options.centerBased===true;
  const multiplier=centerBased?2:1;
  let width=bounds.widthMm,height=bounds.heightMm;
  if(anchor.includes('E'))width+=delta.xMm*multiplier;
  if(anchor.includes('W'))width-=delta.xMm*multiplier;
  if(anchor.includes('S'))height+=delta.yMm*multiplier;
  if(anchor.includes('N'))height-=delta.yMm*multiplier;
  width=Math.max(min,width);height=Math.max(min,height);

  if(options.maintainAspectRatio&&bounds.widthMm>0&&bounds.heightMm>0){
    const ratio=bounds.widthMm/bounds.heightMm;
    const widthChange=Math.abs(width-bounds.widthMm)/Math.max(bounds.widthMm,1e-9);
    const heightChange=Math.abs(height-bounds.heightMm)/Math.max(bounds.heightMm,1e-9);
    if(widthChange>=heightChange)height=Math.max(min,width/ratio);else width=Math.max(min,height*ratio);
  }

  if(centerBased){
    const cx=bounds.xMm+bounds.widthMm/2,cy=bounds.yMm+bounds.heightMm/2;
    return{xMm:cx-width/2,yMm:cy-height/2,widthMm:width,heightMm:height};
  }
  // Keep the point opposite the dragged handle fixed. For side handles the
  // opposite point is the middle of the opposite edge, so aspect-constrained
  // resizing grows symmetrically on the perpendicular axis.
  const opposite=oppositeAnchor(anchor);
  const fx=opposite.includes('W')?0:opposite.includes('E')?1:.5;
  const fy=opposite.includes('N')?0:opposite.includes('S')?1:.5;
  const fixedX=bounds.xMm+fx*bounds.widthMm,fixedY=bounds.yMm+fy*bounds.heightMm;
  return{xMm:fixedX-fx*width,yMm:fixedY-fy*height,widthMm:width,heightMm:height};
}

/** Apply one selection-bounds resize from immutable drag-start snapshots. This avoids
 * compounding scale error across pointer-move events and keeps PATH geometry in sync. */
export function resizeElementsFromSnapshots(
  template:DesignTemplate,
  artboardId:string,
  snapshots:readonly DesignElement[],
  sourceBounds:DesignRectMm,
  targetBounds:DesignRectMm,
  minSizeMm=DEFAULT_MIN_ELEMENT_SIZE_MM
):DesignTemplate {
  if(sourceBounds.widthMm<=0||sourceBounds.heightMm<=0||targetBounds.widthMm<=0||targetBounds.heightMm<=0)return template;
  const byId=new Map(snapshots.map(element=>[element.id,element] as const));
  const scaleX=targetBounds.widthMm/sourceBounds.widthMm,scaleY=targetBounds.heightMm/sourceBounds.heightMm;
  const min=Math.max(0.001,minSizeMm);
  return updateArtboard(template,artboardId,artboard=>({...artboard,elements:artboard.elements.map(current=>{
    const source=byId.get(current.id);
    if(!source||current.locked)return current;
    const relX=(source.position.xMm-sourceBounds.xMm)/sourceBounds.widthMm;
    const relY=(source.position.yMm-sourceBounds.yMm)/sourceBounds.heightMm;
    const width=Math.max(min,source.size.widthMm*scaleX),height=Math.max(min,source.size.heightMm*scaleY);
    const next={...source,position:{xMm:targetBounds.xMm+relX*targetBounds.widthMm,yMm:targetBounds.yMm+relY*targetBounds.heightMm},size:{widthMm:width,heightMm:height}} as DesignElement;
    if(source.type==='PATH'&&source.size.widthMm>0&&source.size.heightMm>0){
      return {...next,geometry:scalePathGeometry((source as PathDesignElement).geometry,width/source.size.widthMm,height/source.size.heightMm)} as DesignElement;
    }
    return next;
  })}));
}

export function rotateElement(template:DesignTemplate,artboardId:string,elementId:string,rotationDeg:number):DesignTemplate {
  return updateArtboard(template,artboardId,a=>({...a,elements:a.elements.map(e=>e.id===elementId&&!e.locked?{...e,rotationDeg:normalizeRotationDeg(rotationDeg)}:e)}));
}

export function setElementsRotation(template:DesignTemplate,artboardId:string,elementIds:readonly string[],rotationDeg:number):DesignTemplate {
  const ids=new Set(elementIds);
  const normalized=normalizeRotationDeg(rotationDeg);
  return updateArtboard(template,artboardId,a=>({...a,elements:a.elements.map(e=>ids.has(e.id)&&!e.locked?{...e,rotationDeg:normalized}:e)}));
}

export function setElementsPositionAxis(template:DesignTemplate,artboardId:string,elementIds:readonly string[],axis:'X'|'Y',valueMm:number):DesignTemplate {
  if(!Number.isFinite(valueMm))return template;
  const ids=new Set(elementIds);
  return updateArtboard(template,artboardId,a=>({...a,elements:a.elements.map(e=>{
    if(!ids.has(e.id)||e.locked)return e;
    return {...e,position:axis==='X'?{xMm:valueMm,yMm:e.position.yMm}:{xMm:e.position.xMm,yMm:valueMm}};
  })}));
}

export function setElementsSizeDimension(template:DesignTemplate,artboardId:string,elementIds:readonly string[],dimension:'WIDTH'|'HEIGHT',valueMm:number,options:Omit<ResizeElementOptions,'anchor'>={}):DesignTemplate {
  if(!Number.isFinite(valueMm))return template;
  const ids=new Set(elementIds);
  const min=Math.max(0.001,options.minSizeMm??DEFAULT_MIN_ELEMENT_SIZE_MM);
  return updateArtboard(template,artboardId,artboard=>({...artboard,elements:artboard.elements.map(element=>{
    if(!ids.has(element.id)||element.locked)return element;
    const width=dimension==='WIDTH'?Math.max(min,valueMm):element.size.widthMm;
    const height=dimension==='HEIGHT'?Math.max(min,valueMm):element.size.heightMm;
    const next={...element,size:{widthMm:width,heightMm:height}} as DesignElement;
    if(element.type==='PATH'&&element.size.widthMm>0&&element.size.heightMm>0){
      return {...next,geometry:scalePathGeometry(element.geometry,width/element.size.widthMm,height/element.size.heightMm)} as DesignElement;
    }
    return next;
  })}));
}


export type MatchSizeMode = 'WIDTH'|'HEIGHT'|'BOTH';

/** Match selected unlocked elements to the primary element's dimensions.
 * Each element keeps its own position/rotation; PATH geometry scales with its box.
 * Group-aware matching is intentionally deferred to Phase 8.4. */
export function matchElementsSize(
  template:DesignTemplate,
  artboardId:string,
  elementIds:readonly string[],
  primaryElementId:string,
  mode:MatchSizeMode,
):DesignTemplate {
  const artboard=template.artboards.find(a=>a.id===artboardId);
  const primary=artboard?.elements.find(e=>e.id===primaryElementId);
  if(!artboard||!primary||primary.locked)return template;
  const selected=new Set(elementIds);
  let next=template;
  for(const id of elementIds){
    if(id===primaryElementId)continue;
    const element=next.artboards.find(a=>a.id===artboardId)?.elements.find(e=>e.id===id);
    if(!element||element.locked||!selected.has(id))continue;
    const size={
      widthMm:mode==='HEIGHT'?element.size.widthMm:primary.size.widthMm,
      heightMm:mode==='WIDTH'?element.size.heightMm:primary.size.heightMm,
    };
    next=resizeElement(next,artboardId,id,size,{anchor:'SE'});
  }
  return next;
}

export function nudgeElements(template:DesignTemplate,artboardId:string,elementIds:readonly string[],direction:'LEFT'|'RIGHT'|'UP'|'DOWN',large=false,stepMm=DEFAULT_NUDGE_MM,largeStepMm=DEFAULT_LARGE_NUDGE_MM):DesignTemplate {
  const amount=large?largeStepMm:stepMm;
  const delta:DesignPoint=direction==='LEFT'?{xMm:-amount,yMm:0}:direction==='RIGHT'?{xMm:amount,yMm:0}:direction==='UP'?{xMm:0,yMm:-amount}:{xMm:0,yMm:amount};
  return moveElements(template,artboardId,elementIds,delta);
}
