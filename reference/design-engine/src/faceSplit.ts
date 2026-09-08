import paper from 'paper';
import type {DesignElement,PathDesignElement,PathGeometry,PathPoint,ShapeDesignElement} from '@document-tool/contracts';
import {geometryToPaperItem,transformGeometry} from './booleanUtils.js';
import {localToWorld,shapeToPathGeometry} from './pathUtils.js';

export type BoundarySnapKind='NODE'|'INTERSECTION'|'MIDPOINT'|'CENTER'|'ON_PATH';
export type BoundarySnap={elementId:string;point:{x:number;y:number};kind:BoundarySnapKind;distanceMm:number;offset:number};

function sourceGeometry(element:DesignElement):PathGeometry|undefined{
 if(element.type==='PATH')return (element as PathDesignElement).geometry;
 if(element.type==='SHAPE')return shapeToPathGeometry((element as ShapeDesignElement).shape,element.size);
 return undefined;
}
function worldGeometry(element:DesignElement):PathGeometry|undefined{
 const geometry=sourceGeometry(element);return geometry?transformGeometry(geometry,point=>localToWorld(point,element)):undefined;
}
function vectorPath(element:DesignElement):paper.Path|undefined{
 const geometry=worldGeometry(element);if(!geometry)return undefined;const item=geometryToPaperItem(geometry);return item instanceof paper.Path?item:undefined;
}
function simplePath(element:DesignElement):paper.Path|undefined{
 const geometry=worldGeometry(element);if(!geometry?.closed)return undefined;const item=geometryToPaperItem(geometry);return item instanceof paper.Path?item:undefined;
}

const SNAP_PRIORITY:Record<BoundarySnapKind,number>={NODE:0,INTERSECTION:1,MIDPOINT:2,CENTER:3,ON_PATH:4};
function choose(best:BoundarySnap|undefined,candidate:BoundarySnap|undefined):BoundarySnap|undefined{
 if(!candidate)return best;if(!best)return candidate;
 const a=SNAP_PRIORITY[candidate.kind],b=SNAP_PRIORITY[best.kind];
 if(a!==b)return a<b?candidate:best;
 return candidate.distanceMm<best.distanceMm?candidate:best;
}

/**
 * Returns one contextual OSNAP candidate only. The search is intentionally
 * pointer-local: callers control the screen-space tolerance converted to mm.
 */
export function findBoundarySnap(elements:readonly DesignElement[],point:{x:number;y:number},toleranceMm:number,excludeIds:readonly string[]=[]):BoundarySnap|undefined{
 const excluded=new Set(excludeIds);
 const candidates=elements.filter(element=>!excluded.has(element.id)&&element.visible&&!element.locked&&!element.runtimeHidden&&(element.type==='PATH'||element.type==='SHAPE'));
 const paths=new Map<string,paper.Path>();
 for(const element of candidates){const path=vectorPath(element);if(path)paths.set(element.id,path);}
 let best:BoundarySnap|undefined;
 const pointer=new paper.Point(point.x,point.y);
 for(const element of candidates){const path=paths.get(element.id);if(!path)continue;const geometry=worldGeometry(element)!;
  for(const node of geometry.points){const distanceMm=Math.hypot(point.x-node.x,point.y-node.y);if(distanceMm<=toleranceMm){const location=path.getNearestLocation(new paper.Point(node.x,node.y));best=choose(best,{elementId:element.id,point:{x:node.x,y:node.y},kind:'NODE',distanceMm,offset:location?.offset??0});}}
  for(const other of candidates){if(other.id<=element.id)continue;const otherPath=paths.get(other.id);if(!otherPath)continue;for(const intersection of path.getIntersections(otherPath)){const distanceMm=intersection.point.getDistance(pointer);if(distanceMm<=toleranceMm){best=choose(best,{elementId:element.id,point:{x:intersection.point.x,y:intersection.point.y},kind:'INTERSECTION',distanceMm,offset:intersection.offset});}}}
  if(path.length>1e-6){const midpoint=path.getPointAt(path.length/2);if(midpoint){const distanceMm=midpoint.getDistance(pointer);if(distanceMm<=toleranceMm)best=choose(best,{elementId:element.id,point:{x:midpoint.x,y:midpoint.y},kind:'MIDPOINT',distanceMm,offset:path.length/2});}}
  if(element.type==='SHAPE'&&((element as ShapeDesignElement).shape==='CIRCLE'||(element as ShapeDesignElement).shape==='ELLIPSE')){const center=localToWorld({x:element.size.widthMm/2,y:element.size.heightMm/2},element);const distanceMm=Math.hypot(point.x-center.x,point.y-center.y);if(distanceMm<=toleranceMm)best=choose(best,{elementId:element.id,point:center,kind:'CENTER',distanceMm,offset:0});}
  const location=path.getNearestLocation(pointer),distanceMm=location?.point.getDistance(pointer)??Infinity;if(location&&distanceMm<=toleranceMm)best=choose(best,{elementId:element.id,point:{x:location.point.x,y:location.point.y},kind:'ON_PATH',distanceMm,offset:location.offset});
 }
 return best;
}

function sampleRoute(path:paper.Path,start:number,end:number):Array<{x:number;y:number}>{
 const length=path.length,distance=(end-start+length)%length,steps=Math.max(1,Math.ceil(distance/.35)),points:Array<{x:number;y:number}>=[];
 for(let index=0;index<=steps;index++){const offset=(start+distance*index/steps)%length,p=path.getPointAt(offset===length?0:offset);if(p)points.push({x:p.x,y:p.y});}return points;
}
function sampleOpenRange(path:paper.Path,startOffset:number,endOffset:number):Array<{x:number;y:number}>{const distance=endOffset-startOffset,steps=Math.max(1,Math.ceil(distance/.35)),points=[] as Array<{x:number;y:number}>;for(let i=0;i<=steps;i++){const p=path.getPointAt(startOffset+distance*i/steps);if(p)points.push({x:p.x,y:p.y});}return points;}

function dividerLineage(source:DesignElement,dividerId:string):string[]{
 const existing=source.metadata?.faceDividerIds;
 const ids=Array.isArray(existing)?existing.filter((value):value is string=>typeof value==='string'):[];
 return [...new Set([...ids,dividerId])];
}

function geometryFromWorld(points:Array<{x:number;y:number}>):{geometry:PathGeometry;position:{xMm:number;yMm:number};size:{widthMm:number;heightMm:number}}{
 const compact=points.filter((point,index)=>index===0||Math.hypot(point.x-points[index-1]!.x,point.y-points[index-1]!.y)>1e-6);if(compact.length>1&&Math.hypot(compact[0]!.x-compact.at(-1)!.x,compact[0]!.y-compact.at(-1)!.y)<1e-6)compact.pop();
 const minX=Math.min(...compact.map(p=>p.x)),minY=Math.min(...compact.map(p=>p.y)),maxX=Math.max(...compact.map(p=>p.x)),maxY=Math.max(...compact.map(p=>p.y));
 const pathPoints:PathPoint[]=compact.map(point=>({id:crypto.randomUUID(),x:point.x-minX,y:point.y-minY,mode:'CORNER'}));
 const segments=pathPoints.map((point,index)=>({id:crypto.randomUUID(),type:'LINE' as const,fromPointId:point.id,toPointId:pathPoints[(index+1)%pathPoints.length]!.id}));
 return{geometry:{points:pathPoints,segments,closed:true},position:{xMm:minX,yMm:minY},size:{widthMm:maxX-minX,heightMm:maxY-minY}};
}

const FACE_SPLIT_BOUNDARY_EPS_MM=0.05;
const FACE_SPLIT_MIN_AREA_MM2=0.01;

function polygonArea(points:readonly {x:number;y:number}[]):number{
 let twiceArea=0;
 for(let index=0;index<points.length;index++){const a=points[index]!,b=points[(index+1)%points.length]!;twiceArea+=a.x*b.y-b.x*a.y;}
 return Math.abs(twiceArea)/2;
}

function pointInsideOrOnBoundary(boundary:paper.Path,point:{x:number;y:number}):boolean{
 const p=new paper.Point(point.x,point.y);
 if(boundary.contains(p))return true;
 const nearest=boundary.getNearestPoint(p);
 return Boolean(nearest&&nearest.getDistance(p)<=FACE_SPLIT_BOUNDARY_EPS_MM);
}

export function splitClosedElementByDivider(source:DesignElement,divider:PathDesignElement,groupId:string):PathDesignElement[]|undefined{
 const boundary=simplePath(source),dividerGeo=worldGeometry(divider);
 if(!boundary||!dividerGeo||dividerGeo.closed)return undefined;
 const dividerItem=geometryToPaperItem(dividerGeo);
 if(!(dividerItem instanceof paper.Path)||dividerItem.length<1e-4)return undefined;

 // Build boundary contacts from exact endpoints plus true crossings. This lets
 // a long CAD line cross a face and be clipped to its entry/exit points, while
 // preserving the endpoint-only behavior needed by shared-divider T-junctions.
 const contacts:Array<{dividerOffset:number;boundaryLocation:paper.CurveLocation}>=[];
 const addContact=(dividerOffset:number,point:paper.Point)=>{const boundaryLocation=boundary.getNearestLocation(point);if(!boundaryLocation||boundaryLocation.point.getDistance(point)>FACE_SPLIT_BOUNDARY_EPS_MM)return;if(contacts.some(contact=>Math.abs(contact.dividerOffset-dividerOffset)<1e-5||contact.boundaryLocation.point.getDistance(boundaryLocation.point)<FACE_SPLIT_BOUNDARY_EPS_MM))return;contacts.push({dividerOffset,boundaryLocation});};
 const start=dividerItem.firstSegment.point,end=dividerItem.lastSegment.point;
 addContact(0,start);addContact(dividerItem.length,end);
 for(const crossing of dividerItem.getIntersections(boundary))addContact(crossing.offset,crossing.point);
 contacts.sort((a,b)=>a.dividerOffset-b.dividerOffset);
 let selected:{start:typeof contacts[number];end:typeof contacts[number];points:Array<{x:number;y:number}>}|undefined;
 for(let index=0;index<contacts.length-1;index++){const first=contacts[index]!,last=contacts[index+1]!;if(last.dividerOffset-first.dividerOffset<FACE_SPLIT_BOUNDARY_EPS_MM)continue;const points=sampleOpenRange(dividerItem,first.dividerOffset,last.dividerOffset);if(points.length<2||points.slice(1,-1).some(point=>!pointInsideOrOnBoundary(boundary,point)))continue;if(!selected||last.dividerOffset-first.dividerOffset>selected.end.dividerOffset-selected.start.dividerOffset)selected={start:first,end:last,points};}
 if(!selected)return undefined;
 const startLocation=selected.start.boundaryLocation,endLocation=selected.end.boundaryLocation,dividerPoints=selected.points;
 if(startLocation.point.getDistance(endLocation.point)<FACE_SPLIT_BOUNDARY_EPS_MM)return undefined;

 const forward=sampleRoute(boundary,startLocation.offset,endLocation.offset);
 const backward=sampleRoute(boundary,endLocation.offset,startLocation.offset);
 if(forward.length<2||backward.length<2)return undefined;

 // Use the boundary-projected endpoint coordinates so the generated faces
 // share an identical canonical edge even if the raw click differed by tiny
 // floating-point noise.
 const projectedDivider=[
  {x:startLocation.point.x,y:startLocation.point.y},
  ...dividerPoints.slice(1,-1),
  {x:endLocation.point.x,y:endLocation.point.y},
 ];
 const faceWorld=[
  forward.concat([...projectedDivider].reverse().slice(1,-1)),
  backward.concat(projectedDivider.slice(1,-1)),
 ];
 if(faceWorld.some(points=>points.length<3||polygonArea(points)<FACE_SPLIT_MIN_AREA_MM2))return undefined;

 return faceWorld.map((points,index)=>{const normalized=geometryFromWorld(points),intersectionNodeIds=normalized.geometry.points.filter(point=>{const world={x:point.x+normalized.position.xMm,y:point.y+normalized.position.yMm};return Math.hypot(world.x-startLocation.point.x,world.y-startLocation.point.y)<FACE_SPLIT_BOUNDARY_EPS_MM||Math.hypot(world.x-endLocation.point.x,world.y-endLocation.point.y)<FACE_SPLIT_BOUNDARY_EPS_MM;}).map(point=>point.id);return{...source,id:crypto.randomUUID(),type:'PATH',name:`${source.name} Face ${index+1}`,position:normalized.position,size:normalized.size,rotationDeg:0,zIndex:source.zIndex+index,groupId,geometry:normalized.geometry,fill:source.type==='PATH'?source.fill:(source as ShapeDesignElement).fill,stroke:source.type==='PATH'?source.stroke:(source as ShapeDesignElement).stroke,metadata:{...source.metadata,faceComponentId:groupId,faceGeneration:'AUTO_SECTION',faceTopologyVersion:1,faceDividerIds:dividerLineage(source,divider.id),sharedDividerId:divider.id,sharedEdgeStrategy:'COINCIDENT_CANONICAL_EDGE',intersectionNodeIds:[...new Set([...(Array.isArray(source.metadata?.intersectionNodeIds)?source.metadata.intersectionNodeIds.filter((value):value is string=>typeof value==='string'):[]),...intersectionNodeIds])],intersectionTopologyVersion:1}} as PathDesignElement;});
}


export type ComponentFaceSplitResult={sourceId:string;componentId:string;faces:PathDesignElement[]};

/**
 * Finds the current closed face that a committed divider actually partitions.
 * This is intentionally incremental: after the first split, generated faces are
 * normal closed PATH elements, so later boundary→divider / divider→boundary /
 * divider→divider operations can split the affected face without rebuilding a
 * second region engine.
 */
export function splitComponentFaceByDivider(
 elements:readonly DesignElement[],
 divider:PathDesignElement,
 fallbackComponentId:string,
 preferredElementIds:readonly string[]=[],
):ComponentFaceSplitResult|undefined{
 const preferred=new Set(preferredElementIds);
 const candidates=elements
  .filter(element=>element.id!==divider.id&&element.visible&&!element.locked&&!element.runtimeHidden&&(element.type==='PATH'||element.type==='SHAPE'))
  .map(element=>({element,priority:preferred.has(element.id)?0:(element.groupId?1:2)}))
  .sort((a,b)=>a.priority-b.priority||b.element.zIndex-a.element.zIndex);
 for(const {element} of candidates){
  const componentId=element.groupId??fallbackComponentId;
  const faces=splitClosedElementByDivider(element,divider,componentId);
  if(faces)return{sourceId:element.id,componentId,faces};
 }
 return undefined;
}
