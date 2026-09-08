import type { PathGeometry } from '@document-tool/contracts';

export interface CadArcPoint { xMm:number; yMm:number; }
export interface CadArcGeometryResult {
  position:{xMm:number;yMm:number};
  size:{widthMm:number;heightMm:number};
  geometry:PathGeometry;
  center:{xMm:number;yMm:number};
  radiusMm:number;
  sweepDeg:number;
}

const TAU=Math.PI*2;
const directedDelta=(from:number,to:number,direction:1|-1)=>{
  let delta=to-from;
  if(direction===1){while(delta<0)delta+=TAU;while(delta>=TAU)delta-=TAU;}
  else{while(delta>0)delta-=TAU;while(delta<=-TAU)delta+=TAU;}
  return delta;
};

/** Build an editable circular ARC through exact start, through and end points. */
export function createCadArcGeometry(start:CadArcPoint,through:CadArcPoint,end:CadArcPoint,ids?:{startId?:string;throughId?:string;endId?:string;segment1Id?:string;segment2Id?:string}):CadArcGeometryResult|null{
  const ax=start.xMm,ay=start.yMm,bx=through.xMm,by=through.yMm,cx=end.xMm,cy=end.yMm;
  const determinant=2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by));
  if(Math.abs(determinant)<1e-7)return null;
  const a2=ax*ax+ay*ay,b2=bx*bx+by*by,c2=cx*cx+cy*cy;
  const ux=(a2*(by-cy)+b2*(cy-ay)+c2*(ay-by))/determinant;
  const uy=(a2*(cx-bx)+b2*(ax-cx)+c2*(bx-ax))/determinant;
  const radiusMm=Math.hypot(ax-ux,ay-uy);
  if(!Number.isFinite(radiusMm)||radiusMm<0.01)return null;
  const startAngle=Math.atan2(ay-uy,ax-ux),throughAngle=Math.atan2(by-uy,bx-ux),endAngle=Math.atan2(cy-uy,cx-ux);
  const cross=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax),direction:1|-1=cross>0?1:-1;
  const delta1=directedDelta(startAngle,throughAngle,direction),delta2=directedDelta(throughAngle,endAngle,direction);
  if(Math.abs(delta1)<1e-7||Math.abs(delta2)<1e-7)return null;
  const handle=(angle:number,delta:number,outgoing:boolean)=>{
    const k=4/3*Math.tan(Math.abs(delta)/4)*radiusMm*Math.sign(delta);
    const tangent={x:-Math.sin(angle),y:Math.cos(angle)};
    const sign=outgoing?1:-1;
    return{x:ux+Math.cos(angle)*radiusMm+tangent.x*k*sign,y:uy+Math.sin(angle)*radiusMm+tangent.y*k*sign};
  };
  const handles={startOut:handle(startAngle,delta1,true),throughIn:handle(throughAngle,delta1,false),throughOut:handle(throughAngle,delta2,true),endIn:handle(endAngle,delta2,false)};
  const extrema=[{x:ax,y:ay},{x:bx,y:by},{x:cx,y:cy},handles.startOut,handles.throughIn,handles.throughOut,handles.endIn];
  const minX=Math.min(...extrema.map(point=>point.x)),minY=Math.min(...extrema.map(point=>point.y));
  const maxX=Math.max(...extrema.map(point=>point.x)),maxY=Math.max(...extrema.map(point=>point.y));
  const local=(point:{x?:number;y?:number;xMm?:number;yMm?:number})=>({x:(point.xMm??point.x!)-minX,y:(point.yMm??point.y!)-minY});
  const startId=ids?.startId??crypto.randomUUID(),throughId=ids?.throughId??crypto.randomUUID(),endId=ids?.endId??crypto.randomUUID();
  return{position:{xMm:minX,yMm:minY},size:{widthMm:Math.max(maxX-minX,.1),heightMm:Math.max(maxY-minY,.1)},center:{xMm:ux,yMm:uy},radiusMm,sweepDeg:(delta1+delta2)*180/Math.PI,geometry:{closed:false,points:[{id:startId,...local(start),outHandle:local(handles.startOut),mode:'SMOOTH'},{id:throughId,...local(through),inHandle:local(handles.throughIn),outHandle:local(handles.throughOut),mode:'SMOOTH'},{id:endId,...local(end),inHandle:local(handles.endIn),mode:'SMOOTH'}],segments:[{id:ids?.segment1Id??crypto.randomUUID(),type:'CUBIC_BEZIER',fromPointId:startId,toPointId:throughId},{id:ids?.segment2Id??crypto.randomUUID(),type:'CUBIC_BEZIER',fromPointId:throughId,toPointId:endId}]}};
}

export function createCadArcMetadata(start:CadArcPoint,through:CadArcPoint,end:CadArcPoint,result:CadArcGeometryResult):Record<string,unknown>{
  return{cadGeometryKind:'ARC',cadConstruction:false,cadExport:true,cadSectionCandidate:false,cadIntent:'DRAW',cadStartX:start.xMm,cadStartY:start.yMm,cadThroughX:through.xMm,cadThroughY:through.yMm,cadEndX:end.xMm,cadEndY:end.yMm,cadCenterX:result.center.xMm,cadCenterY:result.center.yMm,cadRadiusMm:result.radiusMm,cadSweepDeg:result.sweepDeg};
}
