export type SoftEditFalloff = 'LINEAR' | 'SMOOTH' | 'GAUSSIAN';

type PointLike = { id: string; x: number; y: number; inHandle?: { x: number; y: number }; outHandle?: { x: number; y: number } };
type SegmentLike = { fromPointId: string; toPointId: string; type: string };
type GeometryLike = { points: PointLike[]; segments: SegmentLike[]; closed?: boolean };

function cubicPoint(p0:{x:number;y:number},p1:{x:number;y:number},p2:{x:number;y:number},p3:{x:number;y:number},t:number){
  const mt=1-t;
  return {
    x:mt*mt*mt*p0.x+3*mt*mt*t*p1.x+3*mt*t*t*p2.x+t*t*t*p3.x,
    y:mt*mt*mt*p0.y+3*mt*mt*t*p1.y+3*mt*t*t*p2.y+t*t*t*p3.y,
  };
}

function segmentLength(points:Map<string,PointLike>,segment:SegmentLike){
  const from=points.get(segment.fromPointId),to=points.get(segment.toPointId);
  if(!from||!to)return 0;
  if(segment.type==='LINE')return Math.hypot(to.x-from.x,to.y-from.y);
  const p0={x:from.x,y:from.y},p1=from.outHandle??p0,p3={x:to.x,y:to.y},p2=to.inHandle??p3;
  let length=0,prev=p0;
  for(let i=1;i<=12;i++){
    const next=cubicPoint(p0,p1,p2,p3,i/12);
    length+=Math.hypot(next.x-prev.x,next.y-prev.y);
    prev=next;
  }
  return length;
}

function falloffWeight(normalizedDistance:number,falloff:SoftEditFalloff){
  const t=Math.max(0,Math.min(1,normalizedDistance));
  if(t>=1)return 0;
  if(falloff==='LINEAR')return 1-t;
  if(falloff==='GAUSSIAN')return Math.exp(-4.5*t*t);
  const smooth=t*t*(3-2*t);
  return 1-smooth;
}

/**
 * Calculates proportional-edit weights using distance *along the path graph*.
 * This avoids pulling spatially-near but topologically-distant parts of a loop.
 */
export function calculateSoftPathWeights(
  geometry:GeometryLike,
  anchorIds:string[],
  options:{radiusMm:number;strength?:number;falloff?:SoftEditFalloff;preserveEnds?:boolean},
){
  const radius=Math.max(0.001,options.radiusMm);
  const strength=Math.max(0,Math.min(1,options.strength??1));
  const falloff=options.falloff??'SMOOTH';
  const points=new Map(geometry.points.map(point=>[point.id,point]));
  const adjacency=new Map<string,Array<{id:string;cost:number}>>();
  for(const point of geometry.points)adjacency.set(point.id,[]);
  for(const segment of geometry.segments){
    const cost=Math.max(0.0001,segmentLength(points,segment));
    adjacency.get(segment.fromPointId)?.push({id:segment.toPointId,cost});
    adjacency.get(segment.toPointId)?.push({id:segment.fromPointId,cost});
  }
  const distances=new Map<string,number>();
  const queue:Array<{id:string;distance:number}>=[];
  for(const id of anchorIds){if(points.has(id)){distances.set(id,0);queue.push({id,distance:0});}}
  while(queue.length){
    queue.sort((a,b)=>a.distance-b.distance);
    const current=queue.shift()!;
    if(current.distance!==(distances.get(current.id)??Infinity))continue;
    if(current.distance>radius)continue;
    for(const edge of adjacency.get(current.id)??[]){
      const next=current.distance+edge.cost;
      if(next>radius)continue;
      if(next<(distances.get(edge.id)??Infinity)){
        distances.set(edge.id,next);
        queue.push({id:edge.id,distance:next});
      }
    }
  }
  const endpointIds=new Set<string>();
  if(!geometry.closed){
    for(const [id,edges] of adjacency)if(edges.length<=1)endpointIds.add(id);
  }
  const anchors=new Set(anchorIds);
  const weights=new Map<string,number>();
  for(const point of geometry.points){
    if(anchors.has(point.id)){weights.set(point.id,1);continue;}
    if(options.preserveEnds&&endpointIds.has(point.id)){weights.set(point.id,0);continue;}
    const distance=distances.get(point.id);
    if(distance===undefined){weights.set(point.id,0);continue;}
    weights.set(point.id,falloffWeight(distance/radius,falloff)*strength);
  }
  return weights;
}
