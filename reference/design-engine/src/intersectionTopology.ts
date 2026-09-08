import type {DesignElement,PathDesignElement,PathGeometry,PathPoint,PathSegment} from '@document-tool/contracts';
import {getPathEndpoints,localToWorld,worldToLocal} from './pathUtils.js';
import {geometryToPaperItem,transformGeometry} from './booleanUtils.js';
import {shapeToPathGeometry,splitPathSegment,clonePathGeometry} from './pathUtils.js';
import paper from 'paper';

const INTERSECTION_EPS=1e-6;
export const INTERSECTION_CLUSTER_TOLERANCE_MM=.2;
type Point={x:number;y:number};
type Request={segmentId:string;t:number;world:Point};
type Endpoint={element:PathDesignElement;pointId:string;segmentId:string;t:0|1;world:Point;declared:boolean};

function crossing(a:Point,b:Point,c:Point,d:Point):{point:Point;t:number;u:number}|undefined{const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx;if(Math.abs(den)<1e-9)return undefined;const qx=c.x-a.x,qy=c.y-a.y,t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;if(t<-INTERSECTION_EPS||t>1+INTERSECTION_EPS||u<-INTERSECTION_EPS||u>1+INTERSECTION_EPS)return undefined;const tc=Math.max(0,Math.min(1,t)),uc=Math.max(0,Math.min(1,u));return{point:{x:a.x+rx*tc,y:a.y+ry*tc},t:tc,u:uc};}
function projection(point:Point,a:Point,b:Point):{point:Point;t:number;distance:number}{const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy,t=len2<1e-12?0:Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/len2)),projected={x:a.x+dx*t,y:a.y+dy*t};return{point:projected,t,distance:Math.hypot(point.x-projected.x,point.y-projected.y)};}
function lineSegments(element:PathDesignElement){const byId=new Map(element.geometry.points.map(point=>[point.id,point] as const));return element.geometry.segments.flatMap(segment=>{if(segment.type!=='LINE')return[];const from=byId.get(segment.fromPointId),to=byId.get(segment.toPointId);return from&&to?[{segment,from:localToWorld(from,element),to:localToWorld(to,element)}]:[];});}
function addRequest(requests:Map<string,Request[]>,elementId:string,request:Request){const list=requests.get(elementId)??[];if(!list.some(existing=>existing.segmentId===request.segmentId&&Math.abs(existing.t-request.t)<INTERSECTION_EPS&&Math.hypot(existing.world.x-request.world.x,existing.world.y-request.world.y)<INTERSECTION_CLUSTER_TOLERANCE_MM))list.push(request);requests.set(elementId,list);}

/** Ensures paper.js is initialized. */
function ensurePaper(){if(!paper.project)paper.setup(new paper.Size(1000,1000));}

/**
 * Materializes persistent intersection nodes at Bezier (curved) cross-element boundaries.
 * Works for CIRCLE, ARC, and any CUBIC_BEZIER path segments — unlike
 * materializeStraightPathIntersections which only handles LINE segments.
 * Call this when entering TRIMMER or EDIT_PATH mode on curved geometry.
 */
export function materializeCurvedPathIntersections(
  elements: readonly DesignElement[],
  focusIds: readonly string[]
): DesignElement[] {
  ensurePaper();
  const focus = new Set(focusIds);

  // Collect all PATH/SHAPE elements as PathDesignElement with world-space paper items
  type PathEntry = {
    element: PathDesignElement;
    worldGeo: PathGeometry;
    paperItem: paper.PathItem;
  };

  const entries: PathEntry[] = [];
  for (const el of elements) {
    if (!el.visible || el.locked || el.runtimeHidden) continue;
    let pathEl: PathDesignElement | null = null;
    if (el.type === 'PATH') {
      pathEl = el as PathDesignElement;
    } else if (el.type === 'SHAPE') {
      const geo = shapeToPathGeometry((el as any).shape, el.size);
      pathEl = { ...el, type: 'PATH', geometry: geo } as unknown as PathDesignElement;
    }
    if (!pathEl) continue;
    const worldGeo = transformGeometry(pathEl.geometry, pt => localToWorld(pt, pathEl!));
    const paperItem = geometryToPaperItem(worldGeo);
    entries.push({ element: pathEl, worldGeo, paperItem });
  }

  // For each focused element, find intersections with every other element
  // key = original element id, value = list of {segmentId, t, worldPt}
  const hitsByElement = new Map<string, Array<{segmentId:string; t:number; worldPt:Point}>>();

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]!, b = entries[j]!;
      if (!focus.has(a.element.id) && !focus.has(b.element.id)) continue;

      const ixs = a.paperItem.getIntersections(b.paperItem);
      for (const ix of ixs) {
        const worldPt = { x: ix.point.x, y: ix.point.y };
        // Find parameter t on segment for element a
        const tA = findCurvedSegmentParam(a.element, worldPt);
        if (tA) {
          const list = hitsByElement.get(a.element.id) ?? [];
          list.push({ segmentId: tA.segmentId, t: tA.t, worldPt });
          hitsByElement.set(a.element.id, list);
        }
        // Find parameter t on segment for element b
        const tB = findCurvedSegmentParam(b.element, worldPt);
        if (tB) {
          const list = hitsByElement.get(b.element.id) ?? [];
          list.push({ segmentId: tB.segmentId, t: tB.t, worldPt });
          hitsByElement.set(b.element.id, list);
        }
      }
    }
  }

  // Clean up paper items
  for (const entry of entries) entry.paperItem.remove();

  if (hitsByElement.size === 0) return elements as DesignElement[];

  // Apply split+tag to each element that has hits
  return elements.map(el => {
    let pathEl: PathDesignElement | null = null;
    if (el.type === 'PATH') pathEl = el as PathDesignElement;
    else if (el.type === 'SHAPE') {
      const geo = shapeToPathGeometry((el as any).shape, el.size);
      pathEl = { ...el, type: 'PATH', geometry: geo } as unknown as PathDesignElement;
    }
    if (!pathEl) return el;

    const hits = hitsByElement.get(pathEl.id);
    if (!hits || hits.length === 0) return el;

    // Sort hits per segment, apply splits
    const bySegment = new Map<string, Array<{t:number; worldPt:Point}>>();
    for (const hit of hits) {
      const list = bySegment.get(hit.segmentId) ?? [];
      list.push({ t: hit.t, worldPt: hit.worldPt });
      bySegment.set(hit.segmentId, list);
    }

    let geometry = clonePathGeometry(pathEl.geometry);
    const intersectionIds = new Set<string>(
      Array.isArray(pathEl.metadata?.intersectionNodeIds)
        ? pathEl.metadata!.intersectionNodeIds.filter((v): v is string => typeof v === 'string')
        : []
    );

    // Process each segment's hits in descending t order (so split doesn't shift earlier t values)
    for (const [segId, segHits] of bySegment) {
      // Sort descending so we split from the end first — keeps earlier t values stable
      segHits.sort((a, b) => b.t - a.t);
      let currentSegId = segId;
      for (const hit of segHits) {
        const seg = geometry.segments.find(s => s.id === currentSegId);
        if (!seg) continue;
        const { t, worldPt } = hit;
        if (t <= 0.01 || t >= 0.99) {
          // Near endpoint — snap existing endpoint and mark it
          const pointId = t <= 0.01 ? seg.fromPointId : seg.toPointId;
          const localPt = worldToLocal(worldPt, pathEl!);
          const pt = geometry.points.find(p => p.id === pointId);
          if (pt) { pt.x = localPt.x; pt.y = localPt.y; }
          intersectionIds.add(pointId);
          continue;
        }
        // Remap t relative to existing segment (after previous splits from end, ids shift)
        const next = splitPathSegment(geometry, currentSegId, t);
        // The newly inserted point sits between fromPointId and the original toPointId
        const originalToId = seg.toPointId;
        const newSeg = next.segments.find(s => s.toPointId === originalToId && s.id !== currentSegId);
        const insertedPointId = newSeg?.fromPointId;
        if (insertedPointId) intersectionIds.add(insertedPointId);
        geometry = next;
        // For next hit (lower t), we need the left child segment
        const leftSeg = geometry.segments.find(s => s.fromPointId === seg.fromPointId);
        if (leftSeg) currentSegId = leftSeg.id;
      }
    }

    const newEl = {
      ...pathEl,
      type: 'PATH' as const,
      geometry,
      metadata: {
        ...(pathEl.metadata ?? {}),
        intersectionNodeIds: [...intersectionIds],
        intersectionTopologyVersion: 2
      }
    };
    return newEl as unknown as DesignElement;
  });
}

/** Find which segment and approximate t parameter on a PathDesignElement corresponds to a world point. */
function evalSegmentPoint(seg: PathSegment, p1: PathPoint, p2: PathPoint, t: number): Point {
  if (seg.type === 'LINE') {
    return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
  }
  const h1 = p1.outHandle || p1, h2 = p2.inHandle || p2, mt = 1 - t;
  return {
    x: mt**3 * p1.x + 3 * mt**2 * t * h1.x + 3 * mt * t**2 * h2.x + t**3 * p2.x,
    y: mt**3 * p1.y + 3 * mt**2 * t * h1.y + 3 * mt * t**2 * h2.y + t**3 * p2.y
  };
}

/** Find which segment and exact t parameter on a PathDesignElement corresponds to a world point. */
function findCurvedSegmentParam(element: PathDesignElement, worldPt: Point): {segmentId:string; t:number} | null {
  const localPt = worldToLocal(worldPt, element);
  let best: {segmentId:string; t:number; dist:number} | null = null;
  const STEPS = 100;

  for (const seg of element.geometry.segments) {
    const p1 = element.geometry.points.find(p => p.id === seg.fromPointId);
    const p2 = element.geometry.points.find(p => p.id === seg.toPointId);
    if (!p1 || !p2) continue;

    let segBestT = 0;
    let segMinDist = Infinity;

    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const pt = evalSegmentPoint(seg, p1, p2, t);
      const d = Math.hypot(pt.x - localPt.x, pt.y - localPt.y);
      if (d < segMinDist) {
        segMinDist = d;
        segBestT = t;
      }
    }

    // Binary search refinement around segBestT for high precision
    let tLow = Math.max(0, segBestT - 1 / STEPS);
    let tHigh = Math.min(1, segBestT + 1 / STEPS);
    for (let iter = 0; iter < 12; iter++) {
      const tMid1 = tLow + (tHigh - tLow) / 3;
      const tMid2 = tHigh - (tHigh - tLow) / 3;
      const pt1 = evalSegmentPoint(seg, p1, p2, tMid1);
      const pt2 = evalSegmentPoint(seg, p1, p2, tMid2);
      const d1 = Math.hypot(pt1.x - localPt.x, pt1.y - localPt.y);
      const d2 = Math.hypot(pt2.x - localPt.x, pt2.y - localPt.y);
      if (d1 < d2) {
        tHigh = tMid2;
        if (d1 < segMinDist) { segMinDist = d1; segBestT = tMid1; }
      } else {
        tLow = tMid1;
        if (d2 < segMinDist) { segMinDist = d2; segBestT = tMid2; }
      }
    }

    if (!best || segMinDist < best.dist) {
      best = { segmentId: seg.id, t: segBestT, dist: segMinDist };
    }
  }

  // Accept best match within 5mm tolerance (Paper.js guaranteed intersection existence)
  return best && best.dist < 5 ? { segmentId: best.segmentId, t: best.t } : null;
}

/** Inserts and consolidates persistent nodes for focused straight PATH topology. */
export function materializeStraightPathIntersections(elements:readonly DesignElement[],focusIds:readonly string[]):DesignElement[]{
 const focus=new Set(focusIds),paths=elements.filter((element):element is PathDesignElement=>element.type==='PATH'&&element.visible&&!element.locked&&!element.runtimeHidden&&!['XLINE','RAY'].includes(String(element.metadata?.cadGeometryKind))),requests=new Map<string,Request[]>();
 const endpoints:Endpoint[]=paths.flatMap(element=>{const ids=new Set(getPathEndpoints(element.geometry)),declared=new Set(Array.isArray(element.metadata?.intersectionNodeIds)?element.metadata.intersectionNodeIds.filter((value):value is string=>typeof value==='string'):[]);return element.geometry.points.flatMap(point=>{if(!ids.has(point.id))return[];const segment=element.geometry.segments.find(item=>item.fromPointId===point.id||item.toPointId===point.id);if(!segment||segment.type!=='LINE')return[];return[{element,pointId:point.id,segmentId:segment.id,t:segment.fromPointId===point.id?0:1,world:localToWorld(point,element),declared:declared.has(point.id)} as Endpoint];});});
 const visited=new Set<number>();for(let seed=0;seed<endpoints.length;seed++){if(visited.has(seed))continue;const cluster:number[]=[seed],queue=[seed];visited.add(seed);while(queue.length){const current=queue.shift()!;for(let index=0;index<endpoints.length;index++){if(visited.has(index)||Math.hypot(endpoints[current]!.world.x-endpoints[index]!.world.x,endpoints[current]!.world.y-endpoints[index]!.world.y)>INTERSECTION_CLUSTER_TOLERANCE_MM)continue;visited.add(index);queue.push(index);cluster.push(index);}}const members=cluster.map(index=>endpoints[index]!),elementIds=new Set(members.map(member=>member.element.id));if(elementIds.size<2||!members.some(member=>focus.has(member.element.id)))continue;const canonical=[...members].sort((a,b)=>Number(b.declared)-Number(a.declared)||a.element.zIndex-b.element.zIndex||a.element.id.localeCompare(b.element.id)||a.pointId.localeCompare(b.pointId))[0]!.world;for(const member of members)addRequest(requests,member.element.id,{segmentId:member.segmentId,t:member.t,world:canonical});}
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){const first=paths[i]!,second=paths[j]!;if(!focus.has(first.id)&&!focus.has(second.id))continue;for(const a of lineSegments(first))for(const b of lineSegments(second)){const hit=crossing(a.from,a.to,b.from,b.to);if(hit){addRequest(requests,first.id,{segmentId:a.segment.id,t:hit.t,world:hit.point});addRequest(requests,second.id,{segmentId:b.segment.id,t:hit.u,world:hit.point});continue;}for(const candidate of [{point:a.from,t:0 as const},{point:a.to,t:1 as const}]){const projected=projection(candidate.point,b.from,b.to);if(projected.distance<=INTERSECTION_CLUSTER_TOLERANCE_MM&&projected.t>INTERSECTION_EPS&&projected.t<1-INTERSECTION_EPS){addRequest(requests,first.id,{segmentId:a.segment.id,t:candidate.t,world:projected.point});addRequest(requests,second.id,{segmentId:b.segment.id,t:projected.t,world:projected.point});}}for(const candidate of [{point:b.from,t:0 as const},{point:b.to,t:1 as const}]){const projected=projection(candidate.point,a.from,a.to);if(projected.distance<=INTERSECTION_CLUSTER_TOLERANCE_MM&&projected.t>INTERSECTION_EPS&&projected.t<1-INTERSECTION_EPS){addRequest(requests,second.id,{segmentId:b.segment.id,t:candidate.t,world:projected.point});addRequest(requests,first.id,{segmentId:a.segment.id,t:projected.t,world:projected.point});}}}}
 return elements.map(element=>{if(element.type!=='PATH')return element;const elementRequests=requests.get(element.id);if(!elementRequests?.length)return element;const originalById=new Map(element.geometry.points.map(point=>[point.id,point] as const)),points:PathPoint[]=element.geometry.points.map(point=>({...point,inHandle:point.inHandle?{...point.inHandle}:undefined,outHandle:point.outHandle?{...point.outHandle}:undefined})),segments:PathSegment[]=[],intersectionIds=new Set(Array.isArray(element.metadata?.intersectionNodeIds)?element.metadata.intersectionNodeIds.filter((value):value is string=>typeof value==='string'):[]);
  const movePoint=(pointId:string,world:Point)=>{const point=points.find(item=>item.id===pointId);if(!point)return;const local=worldToLocal(world,element),dx=local.x-point.x,dy=local.y-point.y;point.x=local.x;point.y=local.y;if(point.inHandle)point.inHandle={x:point.inHandle.x+dx,y:point.inHandle.y+dy};if(point.outHandle)point.outHandle={x:point.outHandle.x+dx,y:point.outHandle.y+dy};intersectionIds.add(pointId);};
  for(const segment of element.geometry.segments){const hits=elementRequests.filter(request=>request.segmentId===segment.id).sort((a,b)=>a.t-b.t).filter((request,index,array)=>index===0||Math.abs(request.t-array[index-1]!.t)>INTERSECTION_EPS);if(segment.type!=='LINE'||!hits.length){segments.push({...segment});continue;}const from=originalById.get(segment.fromPointId),to=originalById.get(segment.toPointId);if(!from||!to){segments.push({...segment});continue;}const chain=[segment.fromPointId];for(const hit of hits){if(hit.t<=INTERSECTION_EPS){movePoint(segment.fromPointId,hit.world);continue;}if(hit.t>=1-INTERSECTION_EPS){movePoint(segment.toPointId,hit.world);continue;}const local=worldToLocal(hit.world,element),existing=points.find(point=>Math.hypot(point.x-local.x,point.y-local.y)<=INTERSECTION_EPS),pointId=existing?.id??crypto.randomUUID();if(!existing)points.push({id:pointId,x:local.x,y:local.y,mode:'CORNER'});intersectionIds.add(pointId);if(chain.at(-1)!==pointId)chain.push(pointId);}if(chain.at(-1)!==segment.toPointId)chain.push(segment.toPointId);for(let index=0;index<chain.length-1;index++)segments.push({id:index===0?segment.id:crypto.randomUUID(),type:'LINE',fromPointId:chain[index]!,toPointId:chain[index+1]!});}
  const geometry:PathGeometry={...element.geometry,points,segments};return{...element,geometry,metadata:{...element.metadata,intersectionNodeIds:[...intersectionIds],intersectionTopologyVersion:2}};
 });
}

