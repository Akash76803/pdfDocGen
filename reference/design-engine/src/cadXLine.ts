import type { PathGeometry } from '@document-tool/contracts';

export interface CadXLinePoint { xMm:number; yMm:number; }
export interface CadXLineGeometryResult {
  position:{xMm:number;yMm:number};
  size:{widthMm:number;heightMm:number};
  geometry:PathGeometry;
  angleDeg:number;
  clippedStart:CadXLinePoint;
  clippedEnd:CadXLinePoint;
}

const EPS=1e-9;
const norm=(deg:number)=>((deg%360)+360)%360;

/**
 * Clips the infinite line through origin/through to the artboard rectangle.
 * The saved PATH is finite only because the editor viewport is finite; metadata
 * retains the defining origin+direction so it remains semantically an XLINE.
 */
export function createCadXLineGeometry(origin:CadXLinePoint,through:CadXLinePoint,widthMm:number,heightMm:number):CadXLineGeometryResult{
  const dx=through.xMm-origin.xMm,dy=through.yMm-origin.yMm;
  if(Math.hypot(dx,dy)<EPS)throw new Error('Construction line requires two distinct points');
  const hits:Array<{t:number;xMm:number;yMm:number}>=[];
  const push=(t:number,xMm:number,yMm:number)=>{
    if(xMm<-EPS||xMm>widthMm+EPS||yMm<-EPS||yMm>heightMm+EPS)return;
    if(hits.some(h=>Math.hypot(h.xMm-xMm,h.yMm-yMm)<1e-7))return;
    hits.push({t,xMm:Math.min(widthMm,Math.max(0,xMm)),yMm:Math.min(heightMm,Math.max(0,yMm))});
  };
  if(Math.abs(dx)>EPS){let t=(0-origin.xMm)/dx;push(t,0,origin.yMm+t*dy);t=(widthMm-origin.xMm)/dx;push(t,widthMm,origin.yMm+t*dy);}
  if(Math.abs(dy)>EPS){let t=(0-origin.yMm)/dy;push(t,origin.xMm+t*dx,0);t=(heightMm-origin.yMm)/dy;push(t,origin.xMm+t*dx,heightMm);}
  hits.sort((a,b)=>a.t-b.t);
  if(hits.length<2)throw new Error('Construction line does not cross the artboard');
  const a=hits[0]!,b=hits[hits.length-1]!;
  const minX=Math.min(a.xMm,b.xMm),minY=Math.min(a.yMm,b.yMm);
  const p1=crypto.randomUUID(),p2=crypto.randomUUID();
  return {
    position:{xMm:minX,yMm:minY},
    size:{widthMm:Math.max(Math.abs(b.xMm-a.xMm),0.1),heightMm:Math.max(Math.abs(b.yMm-a.yMm),0.1)},
    geometry:{points:[{id:p1,x:a.xMm-minX,y:a.yMm-minY,mode:'CORNER'},{id:p2,x:b.xMm-minX,y:b.yMm-minY,mode:'CORNER'}],segments:[{id:crypto.randomUUID(),type:'LINE',fromPointId:p1,toPointId:p2}],closed:false},
    angleDeg:norm(Math.atan2(dy,dx)*180/Math.PI),
    clippedStart:{xMm:a.xMm,yMm:a.yMm},clippedEnd:{xMm:b.xMm,yMm:b.yMm}
  };
}

export function createCadXLineMetadata(origin:CadXLinePoint,through:CadXLinePoint):Record<string,unknown>{
  return {cadGeometryKind:'XLINE',cadConstruction:true,cadExport:false,cadSectionCandidate:false,cadIntent:'GUIDE',cadOriginX:origin.xMm,cadOriginY:origin.yMm,cadThroughX:through.xMm,cadThroughY:through.yMm};
}
