import type { PathDesignElement, PathGeometry } from '@document-tool/contracts';

export interface CadPolylinePoint { xMm:number; yMm:number; }
export interface CadPolylineGeometryResult {
  position:{xMm:number;yMm:number};
  size:{widthMm:number;heightMm:number};
  geometry:PathGeometry;
}

function normalizeWorldPoints(points:Array<{id:string;xMm:number;yMm:number}>):CadPolylineGeometryResult{
  const minX=Math.min(...points.map(p=>p.xMm));
  const minY=Math.min(...points.map(p=>p.yMm));
  const maxX=Math.max(...points.map(p=>p.xMm));
  const maxY=Math.max(...points.map(p=>p.yMm));
  return {
    position:{xMm:minX,yMm:minY},
    size:{widthMm:Math.max(maxX-minX,0.1),heightMm:Math.max(maxY-minY,0.1)},
    geometry:{
      points:points.map(p=>({id:p.id,x:p.xMm-minX,y:p.yMm-minY,mode:'CORNER' as const})),
      segments:points.slice(1).map((p,index)=>({id:crypto.randomUUID(),type:'LINE' as const,fromPointId:points[index]!.id,toPointId:p.id})),
      closed:false
    }
  };
}

/** Creates a one-object CAD polyline from exact world-space vertices. */
export function createCadPolylineGeometry(points:CadPolylinePoint[],pointIds?:string[]):CadPolylineGeometryResult{
  if(points.length===0) throw new Error('CAD polyline requires at least one point');
  return normalizeWorldPoints(points.map((p,index)=>({id:pointIds?.[index]??crypto.randomUUID(),xMm:p.xMm,yMm:p.yMm})));
}

/**
 * Appends one exact world-space vertex to an open, unrotated CAD polyline and
 * re-normalizes its local geometry so the element shell always covers the path.
 */
export function appendCadPolylinePoint(element:PathDesignElement,point:CadPolylinePoint,pointId=crypto.randomUUID()):PathDesignElement{
  if(element.geometry.closed) return element;
  const world=element.geometry.points.map(p=>({id:p.id,xMm:element.position.xMm+p.x,yMm:element.position.yMm+p.y}));
  const last=world[world.length-1];
  if(last&&Math.hypot(last.xMm-point.xMm,last.yMm-point.yMm)<1e-9)return element;
  const normalized=normalizeWorldPoints([...world,{id:pointId,xMm:point.xMm,yMm:point.yMm}]);
  return {...element,position:normalized.position,size:normalized.size,geometry:normalized.geometry};
}


/** Closes an open CAD polyline by welding its last vertex back to the first vertex. */
export function closeCadPolyline(element:PathDesignElement):PathDesignElement{
  if(element.geometry.closed||element.geometry.points.length<3)return element;
  const first=element.geometry.points[0]!;
  const last=element.geometry.points[element.geometry.points.length-1]!;
  const hasClosing=element.geometry.segments.some(segment=>segment.fromPointId===last.id&&segment.toPointId===first.id);
  return {...element,geometry:{...element.geometry,closed:true,segments:hasClosing?element.geometry.segments:[...element.geometry.segments,{id:crypto.randomUUID(),type:'LINE' as const,fromPointId:last.id,toPointId:first.id}]},metadata:{...element.metadata,cadClosed:true}};
}

/** Returns true when a world-space point is close enough to the first vertex to close the polyline. */
export function cadPolylineCanCloseAtPoint(element:PathDesignElement,point:CadPolylinePoint,toleranceMm=.05):boolean{
  if(element.geometry.closed||element.geometry.points.length<3)return false;
  const first=element.geometry.points[0];if(!first)return false;
  const firstWorld={xMm:element.position.xMm+first.x,yMm:element.position.yMm+first.y};
  return Math.hypot(firstWorld.xMm-point.xMm,firstWorld.yMm-point.yMm)<=Math.max(.001,toleranceMm);
}

export function createCadPolylineMetadata(startTargetId?:string):Record<string,unknown>{
  return {
    cadGeometryKind:'POLYLINE',
    cadSectionCandidate:true,
    cadIntent:'DRAW',
    ...(startTargetId?{cadStartTargetId:startTargetId,dividerBoundaryTargetId:startTargetId}:{})
  };
}
