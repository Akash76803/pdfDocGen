import type { PathGeometry } from '@document-tool/contracts';

export interface CadLinePoint { xMm:number; yMm:number; }
export interface CadLineGeometryResult {
  position:{xMm:number;yMm:number};
  size:{widthMm:number;heightMm:number};
  geometry:PathGeometry;
  lengthMm:number;
  angleDeg:number;
}

const normalizeAngle=(deg:number)=>((deg%360)+360)%360;

/**
 * Builds a deterministic open PATH for a CAD LINE from exact world-space
 * endpoints. The original endpoint coordinates are not rounded or projected,
 * so OSNAP/intersection commits preserve a shared geometric junction.
 */
export function createCadLineGeometry(start:CadLinePoint,end:CadLinePoint,ids?:{point1Id?:string;point2Id?:string;segmentId?:string}):CadLineGeometryResult{
  const minX=Math.min(start.xMm,end.xMm),minY=Math.min(start.yMm,end.yMm);
  const dx=end.xMm-start.xMm,dy=end.yMm-start.yMm;
  const point1Id=ids?.point1Id??crypto.randomUUID();
  const point2Id=ids?.point2Id??crypto.randomUUID();
  const segmentId=ids?.segmentId??crypto.randomUUID();
  return {
    position:{xMm:minX,yMm:minY},
    size:{widthMm:Math.max(Math.abs(dx),0.1),heightMm:Math.max(Math.abs(dy),0.1)},
    geometry:{
      points:[
        {id:point1Id,x:start.xMm-minX,y:start.yMm-minY,mode:'CORNER'},
        {id:point2Id,x:end.xMm-minX,y:end.yMm-minY,mode:'CORNER'}
      ],
      segments:[{id:segmentId,type:'LINE',fromPointId:point1Id,toPointId:point2Id}],
      closed:false
    },
    lengthMm:Math.hypot(dx,dy),
    angleDeg:normalizeAngle(Math.atan2(dy,dx)*180/Math.PI)
  };
}

/** Metadata contract used by future CAD sectioning phases. */
export function createCadLineMetadata(startTargetId?:string,endTargetId?:string):Record<string,unknown>{
  return {
    cadGeometryKind:'LINE',
    cadSectionCandidate:true,
    ...(startTargetId?{cadStartTargetId:startTargetId,dividerBoundaryTargetId:startTargetId}:{}),
    ...(endTargetId?{cadEndTargetId:endTargetId}:{})
  };
}
