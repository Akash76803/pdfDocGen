import type {DesignElement,PathDesignElement,ShapeDesignElement,PathGeometry} from '@document-tool/contracts';
import {shapeToPathGeometry,worldToLocal,localToWorld,hitTestSegment,splitPathSegment} from './pathUtils.js';

export const SHARED_JUNCTION_TOLERANCE_MM = 0.18;
export type SharedJunctionWorldPoint = {x:number;y:number;id?:string};

type SharedMap = Record<string,string>;

function asPath(element:PathDesignElement|ShapeDesignElement):PathDesignElement{
 if(element.type==='PATH')return element;
 return {
  id:element.id,type:'PATH',name:element.name,position:element.position,size:element.size,rotationDeg:element.rotationDeg,
  opacity:element.opacity,visible:element.visible,locked:element.locked,zIndex:element.zIndex,groupId:element.groupId,
  bindings:element.bindings,metadata:element.metadata,visibilityRule:element.visibilityRule,runtimeHidden:element.runtimeHidden,
  geometry:shapeToPathGeometry(element.shape,element.size),fill:element.fill,stroke:element.stroke,shadow:element.shadow,label:element.label
 };
}

function movePointToWorld(element:PathDesignElement,geometry:PathGeometry,pointId:string,world:{x:number;y:number}):PathGeometry{
 const local=worldToLocal(world,element);
 return {...geometry,points:geometry.points.map(point=>{
  if(point.id!==pointId)return point;
  const dx=local.x-point.x,dy=local.y-point.y;
  return {...point,x:local.x,y:local.y,inHandle:point.inHandle?{x:point.inHandle.x+dx,y:point.inHandle.y+dy}:undefined,outHandle:point.outHandle?{x:point.outHandle.x+dx,y:point.outHandle.y+dy}:undefined};
 })};
}

function materializePoint(element:PathDesignElement,world:{x:number;y:number},toleranceMm:number):{element:PathDesignElement;pointId?:string}{
 let geometry=element.geometry;
 const local=worldToLocal(world,element);
 let best:{segmentId:string;t:number;distance:number}|undefined;
 for(const segment of geometry.segments){
  const hit=hitTestSegment(geometry,segment.id,local);
  if(!best||hit.distance<best.distance)best={segmentId:segment.id,t:hit.t,distance:hit.distance};
 }
 if(!best||best.distance>toleranceMm)return{element};
 const segment=geometry.segments.find(item=>item.id===best!.segmentId);
 if(!segment)return{element};
 let pointId:string;
 if(best.t<=0.002)pointId=segment.fromPointId;
 else if(best.t>=0.998)pointId=segment.toPointId;
 else{
  const before=new Set(geometry.points.map(point=>point.id));
  geometry=splitPathSegment(geometry,segment.id,best.t);
  const inserted=geometry.points.find(point=>!before.has(point.id));
  if(!inserted)return{element};
  pointId=inserted.id;
 }
 geometry=movePointToWorld(element,geometry,pointId,world);
 return{element:{...element,geometry},pointId};
}

/**
 * Materializes common topological junction nodes at the supplied world points.
 * SHAPEs touched by a junction are converted to equivalent PATHs while retaining
 * their id/style. Every participant stores the same junction id for its local node.
 */
export function materializeSharedJunctions(
 elements:readonly DesignElement[],
 junctionWorldPoints:readonly SharedJunctionWorldPoint[],
 toleranceMm=SHARED_JUNCTION_TOLERANCE_MM
):DesignElement[]{
 let next=elements.map(element=>element);
 for(const requested of junctionWorldPoints){
  const junctionId=requested.id??crypto.randomUUID();
  next=next.map(original=>{
   if((original.type!=='PATH'&&original.type!=='SHAPE')||!original.visible||original.runtimeHidden||original.locked)return original;
   const path=asPath(original);
   const result=materializePoint(path,requested,toleranceMm);
   if(!result.pointId)return original;
   const existingMap=(result.element.metadata?.sharedJunctionIds&&typeof result.element.metadata.sharedJunctionIds==='object'?result.element.metadata.sharedJunctionIds:{}) as SharedMap;
   const intersectionIds=new Set(Array.isArray(result.element.metadata?.intersectionNodeIds)?result.element.metadata.intersectionNodeIds.filter((value):value is string=>typeof value==='string'):[]);
   intersectionIds.add(result.pointId);
   return {...result.element,metadata:{...result.element.metadata,sharedJunctionIds:{...existingMap,[result.pointId]:junctionId},intersectionNodeIds:[...intersectionIds],sharedJunctionTopologyVersion:1}};
  });
 }
 return next;
}

export function getSharedJunctionId(element:PathDesignElement,pointId:string):string|undefined{
 const map=element.metadata?.sharedJunctionIds;
 return map&&typeof map==='object'&&typeof (map as SharedMap)[pointId]==='string'?(map as SharedMap)[pointId]:undefined;
}

/** Moves every path node participating in a shared junction to the same world point. */
export function moveSharedJunction(elements:readonly DesignElement[],junctionId:string,world:{x:number;y:number}):DesignElement[]{
 return elements.map(element=>{
  if(element.type!=='PATH')return element;
  const map=element.metadata?.sharedJunctionIds as SharedMap|undefined;
  if(!map)return element;
  const pointIds=Object.entries(map).filter(([,id])=>id===junctionId).map(([pointId])=>pointId);
  if(!pointIds.length)return element;
  let geometry=element.geometry;
  for(const pointId of pointIds)geometry=movePointToWorld(element,geometry,pointId,world);
  return {...element,geometry};
 });
}

/** Detaches one element node from a shared junction without moving it. */
export function detachSharedJunctionNode(elements:readonly DesignElement[],elementId:string,pointId:string):DesignElement[]{
 return elements.map(element=>{
  if(element.type!=='PATH'||element.id!==elementId)return element;
  const map=element.metadata?.sharedJunctionIds as SharedMap|undefined;
  if(!map?.[pointId])return element;
  const nextMap={...map};delete nextMap[pointId];
  return {...element,metadata:{...element.metadata,sharedJunctionIds:nextMap}};
 });
}

export function sharedJunctionWorldPoint(element:PathDesignElement,pointId:string):{x:number;y:number}|undefined{
 const point=element.geometry.points.find(candidate=>candidate.id===pointId);
 return point?localToWorld({x:point.x,y:point.y},element):undefined;
}

export function findSharedJunctionAtWorld(elements:readonly DesignElement[],world:{x:number;y:number},toleranceMm=SHARED_JUNCTION_TOLERANCE_MM):{junctionId:string;participants:Array<{elementId:string;pointId:string}>}|undefined{
 const byJunction=new Map<string,Array<{elementId:string;pointId:string;world:{x:number;y:number}}>>();
 for(const element of elements){
  if(element.type!=='PATH')continue;
  const map=element.metadata?.sharedJunctionIds as SharedMap|undefined;if(!map)continue;
  for(const [pointId,junctionId] of Object.entries(map)){
   const pointWorld=sharedJunctionWorldPoint(element,pointId);if(!pointWorld)continue;
   const list=byJunction.get(junctionId)??[];list.push({elementId:element.id,pointId,world:pointWorld});byJunction.set(junctionId,list);
  }
 }
 let best:{junctionId:string;participants:Array<{elementId:string;pointId:string}>;distance:number}|undefined;
 for(const [junctionId,members] of byJunction){
  if(members.length<2)continue;
  const distance=Math.min(...members.map(member=>Math.hypot(member.world.x-world.x,member.world.y-world.y)));
  if(distance<=toleranceMm&&(!best||distance<best.distance))best={junctionId,participants:members.map(({elementId,pointId})=>({elementId,pointId})),distance};
 }
 return best&&{junctionId:best.junctionId,participants:best.participants};
}

/** Breaks a common junction into independent coincident nodes. Geometry is unchanged. */
export function detachSharedJunction(elements:readonly DesignElement[],junctionId:string):DesignElement[]{
 return elements.map(element=>{
  if(element.type!=='PATH')return element;
  const map=element.metadata?.sharedJunctionIds as SharedMap|undefined;if(!map)return element;
  const nextMap=Object.fromEntries(Object.entries(map).filter(([,id])=>id!==junctionId));
  if(Object.keys(nextMap).length===Object.keys(map).length)return element;
  return {...element,metadata:{...element.metadata,sharedJunctionIds:nextMap}};
 });
}
