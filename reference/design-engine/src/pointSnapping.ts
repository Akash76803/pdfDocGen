import paper from 'paper';
import type {Artboard,DesignElement,PathDesignElement,PathGeometry,ShapeDesignElement} from '@document-tool/contracts';
import {geometryToPaperItem,transformGeometry} from './booleanUtils.js';
import {localToWorld,shapeToPathGeometry} from './pathUtils.js';

export type PointSnapKind=
  | 'LINE_ENDPOINT'
  | 'VERTEX'
  | 'INTERSECTION'
  | 'BOUNDARY'
  | 'GUIDE'
  | 'OBJECT_CENTER'
  | 'ARTBOARD_CENTER'
  | 'GRID';

export interface PointSnapResult {
  point:{x:number;y:number};
  kind:PointSnapKind;
  /** Optional human-readable feedback for UI-only/custom snap results. */
  label?:string;
  distanceMm:number;
  elementId?:string;
  guideId?:string;
  detailId?:string;
}

export interface PointSnapOptions {
  enabled?:boolean;
  toleranceMm:number;
  excludeIds?:readonly string[];
  lineStart?:{x:number;y:number};
  snapToBoundaries?:boolean;
  snapToVertices?:boolean;
  snapToIntersections?:boolean;
  snapToGuides?:boolean;
  snapToGrid?:boolean;
  snapToObjectCenters?:boolean;
  snapToArtboardCenter?:boolean;
  gridSizeMm?:number;
}

/**
 * CAD point-snap priority. Lower wins before distance is considered.
 * Declared intersection > endpoint > vertex > exact boundary projection > guide >
 * object center > artboard center > grid.
 */
export const POINT_SNAP_PRIORITY:Readonly<Record<PointSnapKind,number>>={
  INTERSECTION:0,
  LINE_ENDPOINT:1,
  VERTEX:2,
  BOUNDARY:3,
  GUIDE:4,
  OBJECT_CENTER:5,
  ARTBOARD_CENTER:6,
  GRID:7,
};

function sourceGeometry(element:DesignElement):PathGeometry|undefined{
  if(element.type==='PATH')return (element as PathDesignElement).geometry;
  if(element.type==='SHAPE')return shapeToPathGeometry((element as ShapeDesignElement).shape,element.size);
  return undefined;
}

function worldGeometry(element:DesignElement):PathGeometry|undefined{
  const geometry=sourceGeometry(element);
  return geometry?transformGeometry(geometry,p=>localToWorld(p,element)):undefined;
}

function vectorPath(element:DesignElement):paper.Path|undefined{
  const geometry=worldGeometry(element);
  if(!geometry)return undefined;
  const item=geometryToPaperItem(geometry);
  return item instanceof paper.Path?item:undefined;
}

function isLineLikePath(element:DesignElement,geometry:PathGeometry):boolean{
  return element.type==='PATH'&&!geometry.closed&&geometry.segments.length>0;
}

function better(best:PointSnapResult|undefined,candidate:PointSnapResult|undefined):PointSnapResult|undefined{
  if(!candidate)return best;
  if(!best)return candidate;
  const candidateRank=POINT_SNAP_PRIORITY[candidate.kind];
  const bestRank=POINT_SNAP_PRIORITY[best.kind];
  if(candidateRank!==bestRank)return candidateRank<bestRank?candidate:best;
  return candidate.distanceMm<best.distanceMm?candidate:best;
}

function within(point:{x:number;y:number},candidate:{x:number;y:number},toleranceMm:number):number|undefined{
  const distance=Math.hypot(point.x-candidate.x,point.y-candidate.y);
  return distance<=toleranceMm?distance:undefined;
}

function pageBorderEnabled(artboard:Artboard):boolean{
  const raw=(artboard.metadata?.pageBorder??{}) as {enabled?:boolean};
  return raw.enabled??true;
}

function pageBorderSegments(artboard:Artboard):Array<{a:{x:number;y:number};b:{x:number;y:number};detailId:string}>{
  const w=artboard.widthMm,h=artboard.heightMm;
  return[
    {a:{x:0,y:0},b:{x:w,y:0},detailId:'PAGE_TOP'},
    {a:{x:w,y:0},b:{x:w,y:h},detailId:'PAGE_RIGHT'},
    {a:{x:w,y:h},b:{x:0,y:h},detailId:'PAGE_BOTTOM'},
    {a:{x:0,y:h},b:{x:0,y:0},detailId:'PAGE_LEFT'},
  ];
}

function segmentIntersection(a:{x:number;y:number},b:{x:number;y:number},c:{x:number;y:number},d:{x:number;y:number}):{x:number;y:number}|undefined{
  const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx;
  if(Math.abs(den)<1e-10)return undefined;
  const qx=c.x-a.x,qy=c.y-a.y,t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
  if(t<-1e-9||t>1+1e-9||u<-1e-9||u>1+1e-9)return undefined;
  return{x:a.x+rx*Math.max(0,Math.min(1,t)),y:a.y+ry*Math.max(0,Math.min(1,t))};
}

function nearestOnSegment(point:{x:number;y:number},a:{x:number;y:number},b:{x:number;y:number}):{x:number;y:number}{
  const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy,t=len2<1e-12?0:Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/len2));
  return{x:a.x+dx*t,y:a.y+dy*t};
}

/**
 * Resolves one exact point snap for drawing/path-node editing only.
 * Callers must convert their desired screen-pixel radius into mm using the
 * current rendered canvas/editor bounds. This function deliberately does not
 * participate in the existing move/resize snapping pipeline.
 */
export function resolvePointSnap(artboard:Artboard,point:{x:number;y:number},options:PointSnapOptions):PointSnapResult|undefined{
  if(options.enabled===false||options.toleranceMm<=0)return undefined;
  const toleranceMm=options.toleranceMm;
  const excluded=new Set(options.excludeIds??[]);
  const snapToBoundaries=options.snapToBoundaries??true;
  const snapToVertices=options.snapToVertices??true;
  const snapToIntersections=options.snapToIntersections??true;
  const snapToGuides=options.snapToGuides??true;
  const snapToGrid=options.snapToGrid??false;
  const snapToObjectCenters=options.snapToObjectCenters??true;
  const snapToArtboardCenter=options.snapToArtboardCenter??true;
  const gridSizeMm=Math.max(.1,options.gridSizeMm??5);
  const candidates=artboard.elements.filter(element=>!excluded.has(element.id)&&element.visible&&!element.locked&&!element.runtimeHidden);
  const vectorElements=candidates.filter(element=>element.type==='PATH'||element.type==='SHAPE');
  const paths=new Map<string,paper.Path>();
  const geometries=new Map<string,PathGeometry>();
  for(const element of vectorElements){
    const geometry=worldGeometry(element);
    const path=geometry?vectorPath(element):undefined;
    if(geometry)geometries.set(element.id,geometry);
    if(path)paths.set(element.id,path);
  }

  let best:PointSnapResult|undefined;
  const usePageBorder=pageBorderEnabled(artboard);

  if(snapToVertices&&usePageBorder){
    const corners=[
      {x:0,y:0,id:'PAGE_CORNER_TOP_LEFT'},
      {x:artboard.widthMm,y:0,id:'PAGE_CORNER_TOP_RIGHT'},
      {x:artboard.widthMm,y:artboard.heightMm,id:'PAGE_CORNER_BOTTOM_RIGHT'},
      {x:0,y:artboard.heightMm,id:'PAGE_CORNER_BOTTOM_LEFT'},
    ];
    for(const corner of corners){const distance=within(point,corner,toleranceMm);if(distance!==undefined)best=better(best,{point:{x:corner.x,y:corner.y},kind:'VERTEX',label:'Page corner',distanceMm:distance,detailId:corner.id});}
  }

  if(snapToVertices){
    for(const element of vectorElements){
      const geometry=geometries.get(element.id);if(!geometry)continue;
      const endpointIds=isLineLikePath(element,geometry)?new Set([geometry.segments[0]?.fromPointId,geometry.segments.at(-1)?.toPointId]):new Set<string|undefined>();
      const declaredIntersectionIds=new Set(Array.isArray(element.metadata?.intersectionNodeIds)?element.metadata.intersectionNodeIds.filter((value):value is string=>typeof value==='string'):[]);
      for(const node of geometry.points){
        const distance=within(point,node,toleranceMm);if(distance===undefined)continue;
        const endpoint=endpointIds.has(node.id);
        const declaredIntersection=declaredIntersectionIds.has(node.id);
        best=better(best,{point:{x:node.x,y:node.y},kind:declaredIntersection?'INTERSECTION':endpoint?'LINE_ENDPOINT':'VERTEX',label:declaredIntersection?'Intersection':undefined,distanceMm:distance,elementId:element.id,detailId:node.id});
      }
    }
  }

  if(snapToIntersections&&best?.kind!=='INTERSECTION'&&options.lineStart&&Math.hypot(point.x-options.lineStart.x,point.y-options.lineStart.y)>1e-6){
    const probe=new paper.Path.Line(new paper.Point(options.lineStart.x,options.lineStart.y),new paper.Point(point.x,point.y));
    for(const element of vectorElements){
      const path=paths.get(element.id);if(!path)continue;
      for(const intersection of probe.getIntersections(path)){
        const hit={x:intersection.point.x,y:intersection.point.y};
        const distance=within(point,hit,toleranceMm);if(distance===undefined)continue;
        best=better(best,{point:hit,kind:'INTERSECTION',distanceMm:distance,elementId:element.id});
      }
    }
    if(usePageBorder){
      for(const edge of pageBorderSegments(artboard)){const hit=segmentIntersection(options.lineStart,point,edge.a,edge.b);if(!hit)continue;const distance=within(point,hit,toleranceMm);if(distance===undefined)continue;best=better(best,{point:hit,kind:'INTERSECTION',label:'Page border intersection',distanceMm:distance,detailId:edge.detailId});}
    }
    probe.remove();
  }

  if(snapToBoundaries){
    if(usePageBorder){for(const edge of pageBorderSegments(artboard)){const hit=nearestOnSegment(point,edge.a,edge.b),distance=within(point,hit,toleranceMm);if(distance!==undefined)best=better(best,{point:hit,kind:'BOUNDARY',label:'Page border',distanceMm:distance,detailId:edge.detailId});}}
    const pointer=new paper.Point(point.x,point.y);
    for(const element of vectorElements){
      const path=paths.get(element.id);if(!path)continue;
      const location=path.getNearestLocation(pointer);if(!location)continue;
      const hit={x:location.point.x,y:location.point.y};
      const distance=within(point,hit,toleranceMm);if(distance===undefined)continue;
      best=better(best,{point:hit,kind:'BOUNDARY',distanceMm:distance,elementId:element.id,detailId:String(location.offset)});
    }
  }

  if(snapToGuides){
    for(const guide of artboard.guides){
      const snapped=guide.orientation==='VERTICAL'?{x:guide.positionMm,y:point.y}:{x:point.x,y:guide.positionMm};
      const distance=within(point,snapped,toleranceMm);if(distance===undefined)continue;
      best=better(best,{point:snapped,kind:'GUIDE',distanceMm:distance,guideId:guide.id});
    }
  }

  if(snapToObjectCenters){
    for(const element of candidates){
      const center=localToWorld({x:element.size.widthMm/2,y:element.size.heightMm/2},element);
      const distance=within(point,center,toleranceMm);if(distance===undefined)continue;
      best=better(best,{point:center,kind:'OBJECT_CENTER',distanceMm:distance,elementId:element.id});
    }
  }

  if(snapToArtboardCenter){
    const vertical={x:artboard.widthMm/2,y:point.y};
    const horizontal={x:point.x,y:artboard.heightMm/2};
    const dv=within(point,vertical,toleranceMm);
    if(dv!==undefined)best=better(best,{point:vertical,kind:'ARTBOARD_CENTER',distanceMm:dv});
    const dh=within(point,horizontal,toleranceMm);
    if(dh!==undefined)best=better(best,{point:horizontal,kind:'ARTBOARD_CENTER',distanceMm:dh});
  }

  if(snapToGrid){
    const grid={x:Math.round(point.x/gridSizeMm)*gridSizeMm,y:Math.round(point.y/gridSizeMm)*gridSizeMm};
    const distance=within(point,grid,toleranceMm);
    if(distance!==undefined)best=better(best,{point:grid,kind:'GRID',distanceMm:distance});
  }

  return best;
}
