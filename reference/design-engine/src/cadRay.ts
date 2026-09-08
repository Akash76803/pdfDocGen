import type { PathGeometry } from '@document-tool/contracts';

export interface CadRayPoint { xMm:number; yMm:number; }
export interface CadRayGeometryResult {
  position:{xMm:number;yMm:number};
  size:{widthMm:number;heightMm:number};
  geometry:PathGeometry;
  angleDeg:number;
  origin:CadRayPoint;
  clippedEnd:CadRayPoint;
}

const EPS=1e-9;
const norm=(deg:number)=>((deg%360)+360)%360;

/**
 * Creates a CAD RAY from origin through a direction point. The semantic ray is
 * infinite in the forward direction; the stored PATH is clipped to the active
 * artboard so it can be rendered and hit-tested by the editor.
 */
export function createCadRayGeometry(origin:CadRayPoint,through:CadRayPoint,widthMm:number,heightMm:number):CadRayGeometryResult{
  const dx=through.xMm-origin.xMm,dy=through.yMm-origin.yMm;
  const len=Math.hypot(dx,dy);
  if(len<EPS)throw new Error('Ray requires two distinct points');
  const ux=dx/len,uy=dy/len;
  const ts:number[]=[];
  if(ux>EPS)ts.push((widthMm-origin.xMm)/ux); else if(ux<-EPS)ts.push((0-origin.xMm)/ux);
  if(uy>EPS)ts.push((heightMm-origin.yMm)/uy); else if(uy<-EPS)ts.push((0-origin.yMm)/uy);
  const forward=ts.filter(t=>t>EPS && Number.isFinite(t));
  if(!forward.length)throw new Error('Ray does not intersect the artboard in the forward direction');
  const t=Math.min(...forward);
  const end={xMm:Math.min(widthMm,Math.max(0,origin.xMm+ux*t)),yMm:Math.min(heightMm,Math.max(0,origin.yMm+uy*t))};
  const minX=Math.min(origin.xMm,end.xMm),minY=Math.min(origin.yMm,end.yMm);
  const p1=crypto.randomUUID(),p2=crypto.randomUUID();
  return {
    position:{xMm:minX,yMm:minY},
    size:{widthMm:Math.max(Math.abs(end.xMm-origin.xMm),0.1),heightMm:Math.max(Math.abs(end.yMm-origin.yMm),0.1)},
    geometry:{points:[{id:p1,x:origin.xMm-minX,y:origin.yMm-minY,mode:'CORNER'},{id:p2,x:end.xMm-minX,y:end.yMm-minY,mode:'CORNER'}],segments:[{id:crypto.randomUUID(),type:'LINE',fromPointId:p1,toPointId:p2}],closed:false},
    angleDeg:norm(Math.atan2(dy,dx)*180/Math.PI),origin:{...origin},clippedEnd:end
  };
}

export function createCadRayMetadata(origin:CadRayPoint,through:CadRayPoint):Record<string,unknown>{
  return {cadGeometryKind:'RAY',cadConstruction:true,cadExport:false,cadSectionCandidate:false,cadIntent:'GUIDE',cadOriginX:origin.xMm,cadOriginY:origin.yMm,cadThroughX:through.xMm,cadThroughY:through.yMm};
}
