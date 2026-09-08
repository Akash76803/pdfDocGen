import paper from 'paper';
import type { DesignElement, PathDesignElement, PathGeometry } from '@document-tool/contracts';
import { geometryToPaperItem, transformGeometry } from './booleanUtils.js';
import { localToWorld, worldToLocal, splitPathSegment, clonePathGeometry, removeOrphanPathPoints, shapeToPathGeometry } from './pathUtils.js';

/**
 * Initializes the paper environment if not already initialized.
 */
function ensurePaperProject() {
  if (!paper.project) {
    paper.setup(new paper.Size(1000, 1000));
  }
}

export interface TrimInterval {
  segmentId: string;
  tStart: number;
  tEnd: number;
}

export interface EraserStrokePoint { xMm:number; yMm:number }

/** Removes the portion of each canonical segment touched by a world-space
 * eraser stroke. Existing trim primitives perform the actual topology edit. */
export function erasePathWithWorldStroke(
  element:PathDesignElement,
  stroke:readonly EraserStrokePoint[],
  radiusMm:number
):PathGeometry {
  if(!stroke.length||!Number.isFinite(radiusMm)||radiusMm<=0)return clonePathGeometry(element.geometry);
  const distanceToStroke=(point:EraserStrokePoint)=>{
    if(stroke.length===1)return Math.hypot(point.xMm-stroke[0]!.xMm,point.yMm-stroke[0]!.yMm);
    let best=Infinity;
    for(let index=1;index<stroke.length;index++){
      const a=stroke[index-1]!,b=stroke[index]!,dx=b.xMm-a.xMm,dy=b.yMm-a.yMm,lengthSq=dx*dx+dy*dy;
      const t=lengthSq?Math.max(0,Math.min(1,((point.xMm-a.xMm)*dx+(point.yMm-a.yMm)*dy)/lengthSq)):0;
      best=Math.min(best,Math.hypot(point.xMm-(a.xMm+dx*t),point.yMm-(a.yMm+dy*t)));
    }
    return best;
  };
  const evaluate=(segment:PathGeometry['segments'][number],t:number)=>{
    const from=element.geometry.points.find(point=>point.id===segment.fromPointId),to=element.geometry.points.find(point=>point.id===segment.toPointId);if(!from||!to)return null;
    if(segment.type==='LINE')return{x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t};
    const first=from.outHandle??from,second=to.inHandle??to,mt=1-t;
    return{x:mt**3*from.x+3*mt**2*t*first.x+3*mt*t**2*second.x+t**3*to.x,y:mt**3*from.y+3*mt**2*t*first.y+3*mt*t**2*second.y+t**3*to.y};
  };
  const hits:Array<{segmentId:string;tStart:number;tEnd:number}>=[];
  for(const segment of element.geometry.segments){const samples=120,matched:number[]=[];for(let index=0;index<=samples;index++){const t=index/samples,local=evaluate(segment,t);if(!local)continue;const world=localToWorld(local,element);if(distanceToStroke({xMm:world.x,yMm:world.y})<=radiusMm)matched.push(index);}if(matched.length){const padding=1/samples;hits.push({segmentId:segment.id,tStart:Math.max(0,matched[0]!/samples-padding),tEnd:Math.min(1,matched.at(-1)!/samples+padding)});}}
  let geometry=clonePathGeometry(element.geometry);
  for(const hit of hits)geometry=trimSegmentInterval(geometry,hit.segmentId,hit.tStart,hit.tEnd);
  return geometry;
}

/**
 * Gets valid intersection-based trim intervals for a target segment.
 */
export function getSmartTrimIntervals(
  targetElement: PathDesignElement,
  segmentId: string,
  allElements: DesignElement[]
): TrimInterval[] {
  ensurePaperProject();
  
  const targetSegment = targetElement.geometry.segments.find(segment => segment.id === segmentId);
  if (!targetSegment) return [];
  const targetPointIds = new Set([targetSegment.fromPointId, targetSegment.toPointId]);
  const targetGeometry: PathGeometry = {
    points: targetElement.geometry.points.filter(point => targetPointIds.has(point.id)),
    segments: [targetSegment],
    closed: false
  };
  // Isolating the target segment prevents intersections on a neighbouring curve
  // from being incorrectly projected onto this segment.
  const worldGeo = transformGeometry(targetGeometry, pt => localToWorld(pt, targetElement));
  const worldPaper = geometryToPaperItem(worldGeo);
  
  // Collect all other visible valid vector elements and convert to world paper items
  const otherPaperItems: paper.PathItem[] = [];
  for (const el of allElements) {
    if (el.id === targetElement.id) continue;
    if (el.runtimeHidden || !el.visible) continue;
    if (el.type === 'PATH') {
      const pWorldGeo = transformGeometry(el.geometry, pt => localToWorld(pt, el));
      otherPaperItems.push(geometryToPaperItem(pWorldGeo));
    } else if (el.type === 'SHAPE') {
      const shapeGeometry = shapeToPathGeometry(el.shape, el.size);
      const pWorldGeo = transformGeometry(shapeGeometry, pt => localToWorld(pt, el));
      otherPaperItems.push(geometryToPaperItem(pWorldGeo));
    }
  }
  
  // Extract the specific paper.Curve or sub-path corresponding to segmentId
  // In paper.js, we can find intersections of worldPaper with otherPaperItems.
  const tValues: number[] = [0, 1];
  
  // Find intersections
  for (const other of otherPaperItems) {
    const intersections = worldPaper.getIntersections(other);
    for (const ix of intersections) {
      const pt = { x: ix.point.x, y: ix.point.y };
      const localPt = worldToLocal(pt, targetElement);
      
      // Calculate parameter t for the local point on the segment
      const t = getParameterOnSegment(targetElement.geometry, segmentId, localPt);
      if (t !== null) tValues.push(Math.max(0, Math.min(1, t)));
    }
  }
  
  // Clean up paper items
  worldPaper.remove();
  for (const other of otherPaperItems) other.remove();
  
  // Sort and deduplicate t values
  tValues.sort((a, b) => a - b);
  const dedupT: number[] = [];
  for (const t of tValues) {
    if (dedupT.length === 0 || t - dedupT[dedupT.length - 1] > 0.001) {
      dedupT.push(t);
    }
  }
  
  // Create intervals
  const intervals: TrimInterval[] = [];
  for (let i = 0; i < dedupT.length - 1; i++) {
    intervals.push({
      segmentId,
      tStart: dedupT[i],
      tEnd: dedupT[i + 1]
    });
  }
  
  return intervals;
}

export function findTrimInterval(intervals: TrimInterval[], t: number): TrimInterval | null {
  const clampedT = Math.max(0, Math.min(1, t));
  return intervals.find(interval => clampedT >= interval.tStart - 0.000001 && clampedT <= interval.tEnd + 0.000001) ?? null;
}

/**
 * Finds the parameter t on a specific segment for a given local point.
 * We evaluate distances to find the closest t.
 */
function getParameterOnSegment(geometry: PathGeometry, segmentId: string, pt: {x: number, y: number}): number | null {
  const seg = geometry.segments.find(s => s.id === segmentId);
  if (!seg) return null;
  const p1 = geometry.points.find(p => p.id === seg.fromPointId);
  const p2 = geometry.points.find(p => p.id === seg.toPointId);
  if (!p1 || !p2) return null;
  
  const STEPS = 100;
  let minD = Infinity;
  let bestT = 0;
  
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    let evalPt = {x:0,y:0};
    if (seg.type === 'LINE') {
      evalPt = { x: p1.x + (p2.x - p1.x)*t, y: p1.y + (p2.y - p1.y)*t };
    } else {
      const h1 = p1.outHandle || p1;
      const h2 = p2.inHandle || p2;
      const q0 = { x: p1.x + (h1.x - p1.x)*t, y: p1.y + (h1.y - p1.y)*t };
      const q1 = { x: h1.x + (h2.x - h1.x)*t, y: h1.y + (h2.y - h1.y)*t };
      const q2 = { x: h2.x + (p2.x - h2.x)*t, y: h2.y + (p2.y - h2.y)*t };
      const r0 = { x: q0.x + (q1.x - q0.x)*t, y: q0.y + (q1.y - q0.y)*t };
      const r1 = { x: q1.x + (q2.x - q1.x)*t, y: q1.y + (q2.y - q1.y)*t };
      evalPt = { x: r0.x + (r1.x - r0.x)*t, y: r0.y + (r1.y - r0.y)*t };
    }
    const d = Math.hypot(evalPt.x - pt.x, evalPt.y - pt.y);
    if (d < minD) {
      minD = d;
      bestT = t;
    }
  }
  
  if (minD < 0.5) { // Match tolerance
    return bestT;
  }
  return null;
}

/**
 * Trims (deletes) the specified interval from the segment.
 */
export function trimSegmentInterval(
  geometry: PathGeometry,
  segmentId: string,
  tStart: number,
  tEnd: number
): PathGeometry {
  if (tStart > tEnd) {
    const temp = tStart;
    tStart = tEnd;
    tEnd = temp;
  }
  
  // If we are deleting the whole segment, just delete it.
  if (tStart <= 0.001 && tEnd >= 0.999) {
    return deleteSegmentFromGeometry(geometry, segmentId);
  }
  
  let currentGeo = clonePathGeometry(geometry);
  
  const originalSegment = currentGeo.segments.find(segment => segment.id === segmentId);
  if (!originalSegment) return currentGeo;

  // If we only trim from start
  if (tStart <= 0.001) {
    currentGeo = splitPathSegment(currentGeo, segmentId, tEnd);
    const firstChild = currentGeo.segments.find(segment => segment.fromPointId === originalSegment.fromPointId);
    return firstChild ? deleteSegmentFromGeometry(currentGeo, firstChild.id) : clonePathGeometry(geometry);
  }
  
  // If we only trim from end
  if (tEnd >= 0.999) {
    currentGeo = splitPathSegment(currentGeo, segmentId, tStart);
    const lastChild = currentGeo.segments.find(segment => segment.toPointId === originalSegment.toPointId);
    return lastChild ? deleteSegmentFromGeometry(currentGeo, lastChild.id) : clonePathGeometry(geometry);
  }
  
  // Split at the start, then remap the original end parameter onto the right child.
  currentGeo = splitPathSegment(currentGeo, segmentId, tStart);
  const rightChild = currentGeo.segments.find(segment => segment.toPointId === originalSegment.toPointId);
  if (!rightChild) return clonePathGeometry(geometry);
  const mappedEnd = (tEnd - tStart) / (1 - tStart);
  const rightChildStartId = rightChild.fromPointId;
  currentGeo = splitPathSegment(currentGeo, rightChild.id, mappedEnd);
  const middleSegment = currentGeo.segments.find(segment => segment.fromPointId === rightChildStartId);
  return middleSegment ? deleteSegmentFromGeometry(currentGeo, middleSegment.id) : clonePathGeometry(geometry);
}


/**
 * Resolves the complete trim route between the two nearest real intersection
 * boundaries around a hovered point. Unlike findTrimInterval(), this can span
 * multiple canonical segments (for example an overlapping circle arc crossing
 * Bezier segment boundaries). Outer tails on open paths are intentionally not
 * returned.
 */
export function findBoundedTrimRoute(
  geometry: PathGeometry,
  intervalsBySegment: ReadonlyMap<string, readonly TrimInterval[]>,
  hoveredSegmentId: string,
  hoveredT: number
): TrimInterval[] {
  type Atom = TrimInterval & { beforeIntersection:boolean; afterIntersection:boolean };
  const atoms: Atom[] = [];
  for (const segment of geometry.segments) {
    const intervals = intervalsBySegment.get(segment.id) ?? [];
    const cuts = [...new Set(intervals.flatMap(interval => [interval.tStart, interval.tEnd])
      .filter(t => t > 0.001 && t < 0.999)
      .map(t => Math.max(0, Math.min(1, t))))].sort((a,b)=>a-b);
    const bounds = [0, ...cuts, 1];
    for (let index=0; index<bounds.length-1; index++) {
      const tStart=bounds[index]!, tEnd=bounds[index+1]!;
      if (tEnd-tStart <= 1e-8) continue;
      atoms.push({
        segmentId: segment.id, tStart, tEnd,
        beforeIntersection: tStart > 0.001 && tStart < 0.999,
        afterIntersection: tEnd > 0.001 && tEnd < 0.999,
      });
    }
  }
  if (!atoms.length) return [];
  const t=Math.max(0,Math.min(1,hoveredT));
  const hoveredIndex=atoms.findIndex(atom=>atom.segmentId===hoveredSegmentId&&t>=atom.tStart-1e-6&&t<=atom.tEnd+1e-6);
  if(hoveredIndex<0)return[];

  const route: Atom[]=[atoms[hoveredIndex]!];
  let cursor=hoveredIndex;
  let guarded=0;
  while(!route[0]!.beforeIntersection){
    if(++guarded>atoms.length)return[];
    if(cursor===0){if(!geometry.closed)return[];cursor=atoms.length;}
    cursor--;
    const previous=atoms[cursor]!;
    if(route.some(atom=>atom===previous))return[];
    route.unshift(previous);
  }
  cursor=hoveredIndex; guarded=0;
  while(!route[route.length-1]!.afterIntersection){
    if(++guarded>atoms.length)return[];
    cursor++;
    if(cursor>=atoms.length){if(!geometry.closed)return[];cursor=0;}
    const next=atoms[cursor]!;
    if(route.some(atom=>atom===next))return[];
    route.push(next);
  }
  return route.map(({segmentId,tStart,tEnd})=>({segmentId,tStart,tEnd}));
}

/** Deletes a bounded trim route, including routes spanning multiple segments. */
export function trimSegmentIntervals(geometry: PathGeometry, intervals: readonly TrimInterval[]): PathGeometry {
  let next=clonePathGeometry(geometry);
  // Full canonical segments first; boundary partials afterwards. Each route segment
  // is unique in the normal topology traversal, so edits cannot invalidate ids of
  // unrelated route segments.
  const ordered=[...intervals].sort((a,b)=>{
    const af=a.tStart<=0.001&&a.tEnd>=0.999?0:1;
    const bf=b.tStart<=0.001&&b.tEnd>=0.999?0:1;
    return af-bf;
  });
  for(const interval of ordered){
    next=trimSegmentInterval(next,interval.segmentId,interval.tStart,interval.tEnd);
  }
  return next;
}

function deleteSegmentFromGeometry(geometry: PathGeometry, segmentId: string): PathGeometry {
  const cloned = clonePathGeometry(geometry);
  const removed = cloned.segments.some(s => s.id === segmentId);
  cloned.segments = cloned.segments.filter(s => s.id !== segmentId);
  if (!removed) return cloned;
  cloned.closed = false;
  if (cloned.subpaths) {
    cloned.subpaths = cloned.subpaths
      .map(subpath => ({ ...subpath, closed: subpath.segmentIds.includes(segmentId) ? false : subpath.closed, segmentIds: subpath.segmentIds.filter(id => id !== segmentId) }))
      .filter(subpath => subpath.segmentIds.length > 0);
  }
  return removeOrphanPathPoints(cloned);
}
