import type {DesignElement,PathGeometry,PathPoint} from '@document-tool/contracts';
import {localToWorld,shapeToPathGeometry} from './pathUtils.js';

export type JoinedLineRegion={geometry:PathGeometry;position:{xMm:number;yMm:number};size:{widthMm:number;heightMm:number};sourceElementIds:string[];areaMm2:number};
export type JoinedLineRegionBoundary={widthMm:number;heightMm:number;enabled?:boolean};

const JOIN_EPS_MM=.05;
const INTERSECTION_EPS=1e-7;
const MIN_AREA_MM2=.01;
const CURVE_STEPS=24;

type WorldPoint={x:number;y:number};
type Primitive={a:WorldPoint;b:WorldPoint;elementId:string;splits:number[]};
type Edge={a:number;b:number;elementIds:Set<string>};

function signedArea(points:readonly WorldPoint[]):number{let sum=0;for(let i=0;i<points.length;i++){const a=points[i]!,b=points[(i+1)%points.length]!;sum+=a.x*b.y-b.x*a.y;}return sum/2;}
function contains(points:readonly WorldPoint[],point:WorldPoint):boolean{let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i]!,b=points[j]!;const on=Math.abs((point.x-a.x)*(b.y-a.y)-(point.y-a.y)*(b.x-a.x))<=JOIN_EPS_MM*Math.max(1,Math.hypot(b.x-a.x,b.y-a.y))&&point.x>=Math.min(a.x,b.x)-JOIN_EPS_MM&&point.x<=Math.max(a.x,b.x)+JOIN_EPS_MM&&point.y>=Math.min(a.y,b.y)-JOIN_EPS_MM&&point.y<=Math.max(a.y,b.y)+JOIN_EPS_MM;if(on)return true;if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
function lerp(a:WorldPoint,b:WorldPoint,t:number):WorldPoint{return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
function cubic(a:WorldPoint,b:WorldPoint,c:WorldPoint,d:WorldPoint,t:number):WorldPoint{const u=1-t;return{x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y};}
function intersection(a:WorldPoint,b:WorldPoint,c:WorldPoint,d:WorldPoint):{t:number;u:number}|undefined{const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx;if(Math.abs(den)<1e-10)return undefined;const qx=c.x-a.x,qy=c.y-a.y,t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;if(t<-INTERSECTION_EPS||t>1+INTERSECTION_EPS||u<-INTERSECTION_EPS||u>1+INTERSECTION_EPS)return undefined;return{t:Math.max(0,Math.min(1,t)),u:Math.max(0,Math.min(1,u))};}
function projection(point:WorldPoint,a:WorldPoint,b:WorldPoint):{t:number;distance:number}{const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy,t=len2<1e-12?0:Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/len2)),p={x:a.x+dx*t,y:a.y+dy*t};return{t,distance:Math.hypot(point.x-p.x,point.y-p.y)};}
function addSplit(primitive:Primitive,t:number){if(!primitive.splits.some(value=>Math.abs(value-t)<=INTERSECTION_EPS))primitive.splits.push(t);}

function collectPrimitives(elements:readonly DesignElement[],boundary?:JoinedLineRegionBoundary):Primitive[]{
 const primitives:Primitive[]=[];
 if(boundary?.enabled!==false&&Number.isFinite(boundary?.widthMm)&&Number.isFinite(boundary?.heightMm)&&boundary!.widthMm>0&&boundary!.heightMm>0){const w=boundary!.widthMm,h=boundary!.heightMm;for(const [a,b] of [[{x:0,y:0},{x:w,y:0}],[{x:w,y:0},{x:w,y:h}],[{x:w,y:h},{x:0,y:h}],[{x:0,y:h},{x:0,y:0}]] as const)primitives.push({a,b,elementId:'__PAGE_BORDER__',splits:[0,1]});}
 for(const element of elements){
  if((element.type!=='PATH'&&element.type!=='SHAPE')||!element.visible||element.runtimeHidden||['XLINE','RAY'].includes(String(element.metadata?.cadGeometryKind))||element.metadata?.faceGeneration==='AUTO_SECTION')continue;
  const geometry=element.type==='PATH'?element.geometry:shapeToPathGeometry(element.shape,element.size),byId=new Map(geometry.points.map(point=>[point.id,point] as const));
  for(const segment of geometry.segments){
   const from=byId.get(segment.fromPointId),to=byId.get(segment.toPointId);if(!from||!to)continue;
   if(segment.type==='LINE'){
    const a=localToWorld(from,element),b=localToWorld(to,element);if(Math.hypot(b.x-a.x,b.y-a.y)>INTERSECTION_EPS)primitives.push({a,b,elementId:element.id,splits:[0,1]});
    continue;
   }
   const start={x:from.x,y:from.y},control1=from.outHandle??start,end={x:to.x,y:to.y},control2=to.inHandle??end;let previous=localToWorld(start,element);
   for(let step=1;step<=CURVE_STEPS;step++){const next=localToWorld(cubic(start,control1,control2,end,step/CURVE_STEPS),element);if(Math.hypot(next.x-previous.x,next.y-previous.y)>INTERSECTION_EPS)primitives.push({a:previous,b:next,elementId:element.id,splits:[0,1]});previous=next;}
  }
 }
 return primitives;
}

/** Finds the smallest planar face containing the click across LINE/polyline and closed shape boundaries. */
export function findJoinedLineRegionAtPoint(elements:readonly DesignElement[],point:WorldPoint,boundary?:JoinedLineRegionBoundary):JoinedLineRegion|undefined{
 const primitives=collectPrimitives(elements,boundary);
 for(let i=0;i<primitives.length;i++)for(let j=i+1;j<primitives.length;j++){
  const first=primitives[i]!,second=primitives[j]!;const hit=intersection(first.a,first.b,second.a,second.b);
  if(hit){addSplit(first,hit.t);addSplit(second,hit.u);continue;}
  for(const endpoint of [first.a,first.b]){const near=projection(endpoint,second.a,second.b);if(near.distance<=JOIN_EPS_MM)addSplit(second,near.t);}
  for(const endpoint of [second.a,second.b]){const near=projection(endpoint,first.a,first.b);if(near.distance<=JOIN_EPS_MM)addSplit(first,near.t);}
 }

 const nodes:WorldPoint[]=[],edges:Edge[]=[];
 const nodeId=(candidate:WorldPoint)=>{const existing=nodes.findIndex(node=>Math.hypot(node.x-candidate.x,node.y-candidate.y)<=JOIN_EPS_MM);if(existing>=0)return existing;nodes.push(candidate);return nodes.length-1;};
 const edgeByPair=new Map<string,Edge>();
 for(const primitive of primitives){const splits=[...primitive.splits].sort((a,b)=>a-b);for(let index=1;index<splits.length;index++){const a=nodeId(lerp(primitive.a,primitive.b,splits[index-1]!)),b=nodeId(lerp(primitive.a,primitive.b,splits[index]!));if(a===b)continue;const key=a<b?`${a}:${b}`:`${b}:${a}`,existing=edgeByPair.get(key);if(existing)existing.elementIds.add(primitive.elementId);else{const edge={a,b,elementIds:new Set([primitive.elementId])};edgeByPair.set(key,edge);edges.push(edge);}}}
 if(edges.length<3)return undefined;

 const adjacency=new Map<number,number[]>();
 edges.forEach(edge=>{adjacency.set(edge.a,[...(adjacency.get(edge.a)??[]),edge.b]);adjacency.set(edge.b,[...(adjacency.get(edge.b)??[]),edge.a]);});
 for(const [node,neighbors] of adjacency)neighbors.sort((left,right)=>Math.atan2(nodes[left]!.y-nodes[node]!.y,nodes[left]!.x-nodes[node]!.x)-Math.atan2(nodes[right]!.y-nodes[node]!.y,nodes[right]!.x-nodes[node]!.x));
 const visited=new Set<string>(),faces:Array<{ids:number[];areaMm2:number}>=[];
 for(const edge of edges)for(const directed of [[edge.a,edge.b],[edge.b,edge.a]] as const){const startKey=`${directed[0]}>${directed[1]}`;if(visited.has(startKey))continue;const ids:number[]=[];let from=directed[0],to=directed[1],closed=false;
  for(let guard=0;guard<edges.length*2+2;guard++){const key=`${from}>${to}`;if(visited.has(key)&&key!==startKey)break;visited.add(key);ids.push(from);const neighbors=adjacency.get(to)??[],reverseIndex=neighbors.indexOf(from);if(reverseIndex<0||!neighbors.length)break;const next=neighbors[(reverseIndex-1+neighbors.length)%neighbors.length]!;from=to;to=next;if(from===directed[0]&&to===directed[1]){closed=true;break;}}
  if(!closed||ids.length<3)continue;const polygon=ids.map(id=>nodes[id]!),areaMm2=signedArea(polygon);if(areaMm2>=MIN_AREA_MM2&&contains(polygon,point))faces.push({ids,areaMm2});
 }
 const selected=faces.sort((a,b)=>a.areaMm2-b.areaMm2)[0];if(!selected)return undefined;
 const selectedPoints=selected.ids.map(id=>nodes[id]!),minX=Math.min(...selectedPoints.map(p=>p.x)),minY=Math.min(...selectedPoints.map(p=>p.y)),maxX=Math.max(...selectedPoints.map(p=>p.x)),maxY=Math.max(...selectedPoints.map(p=>p.y));
 const pathPoints:PathPoint[]=selectedPoints.map(p=>({id:crypto.randomUUID(),x:p.x-minX,y:p.y-minY,mode:'CORNER'}));
 const segments=pathPoints.map((pathPoint,index)=>({id:crypto.randomUUID(),type:'LINE' as const,fromPointId:pathPoint.id,toPointId:pathPoints[(index+1)%pathPoints.length]!.id}));
 const sourceElementIds=new Set<string>();for(let index=0;index<selected.ids.length;index++){const a=selected.ids[index]!,b=selected.ids[(index+1)%selected.ids.length]!,key=a<b?`${a}:${b}`:`${b}:${a}`;for(const sourceId of edgeByPair.get(key)?.elementIds??[])if(sourceId!=='__PAGE_BORDER__')sourceElementIds.add(sourceId);}
 return{geometry:{points:pathPoints,segments,closed:true},position:{xMm:minX,yMm:minY},size:{widthMm:maxX-minX,heightMm:maxY-minY},sourceElementIds:[...sourceElementIds],areaMm2:selected.areaMm2};
}
