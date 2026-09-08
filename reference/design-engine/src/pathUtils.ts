import type { PathGeometry, PathPoint, PathSegment } from '@document-tool/contracts';

export function clonePathGeometry(geometry: PathGeometry): PathGeometry {
  return {
    points: geometry.points.map(p => ({
      ...p,
      inHandle: p.inHandle ? { ...p.inHandle } : undefined,
      outHandle: p.outHandle ? { ...p.outHandle } : undefined
    })),
    segments: geometry.segments.map(s => ({ ...s })),
    closed: geometry.closed,
    subpaths: geometry.subpaths ? geometry.subpaths.map(sp => ({
      closed: sp.closed,
      segmentIds: [...sp.segmentIds]
    })) : undefined
  };
}

export function validatePathGeometry(geometry: PathGeometry): boolean {
  if (!geometry.points || !geometry.segments) return false;
  const pointIds = new Set(geometry.points.map(p => p.id));
  for (const seg of geometry.segments) {
    if (!pointIds.has(seg.fromPointId) || !pointIds.has(seg.toPointId)) {
      return false;
    }
  }
  return true;
}

export function getPathPoint(geometry: PathGeometry, id: string): PathPoint | undefined {
  return geometry.points.find(p => p.id === id);
}

export function updatePathPoint(geometry: PathGeometry, id: string, updates: Partial<PathPoint>): PathGeometry {
  const cloned = clonePathGeometry(geometry);
  const index = cloned.points.findIndex(p => p.id === id);
  if (index !== -1) {
    cloned.points[index] = { ...cloned.points[index], ...updates };
  }
  return cloned;
}

export function addPathPoint(geometry: PathGeometry, point: PathPoint): PathGeometry {
  const cloned = clonePathGeometry(geometry);
  cloned.points.push(point);
  return cloned;
}

export function deletePathPoint(geometry: PathGeometry, id: string): PathGeometry {
  const cloned = clonePathGeometry(geometry);
  cloned.points = cloned.points.filter(p => p.id !== id);
  
  // Find segments entering and leaving this point
  const entering = cloned.segments.filter(s => s.toPointId === id);
  const leaving = cloned.segments.filter(s => s.fromPointId === id);
  
  // Remove them
  cloned.segments = cloned.segments.filter(s => s.fromPointId !== id && s.toPointId !== id);
  
  // Reconnect topology
  if (entering.length === 1 && leaving.length === 1) {
    const fromId = entering[0].fromPointId;
    const toId = leaving[0].toPointId;
    if (fromId !== toId) {
       cloned.segments.push({ id: crypto.randomUUID(), type: 'CUBIC_BEZIER', fromPointId: fromId, toPointId: toId });
    }
  } else if (geometry.closed && entering.length > 0 && leaving.length > 0) {
     const fromId = entering[0].fromPointId;
     const toId = leaving[0].toPointId;
     if (fromId !== toId) {
       cloned.segments.push({ id: crypto.randomUUID(), type: 'CUBIC_BEZIER', fromPointId: fromId, toPointId: toId });
     }
  }

  return cloned;
}

export function splitPathSegment(geometry: PathGeometry, segmentId: string, t: number = 0.5): PathGeometry {
  const cloned = clonePathGeometry(geometry);
  const segIndex = cloned.segments.findIndex(s => s.id === segmentId);
  if (segIndex === -1) return cloned;
  
  const seg = cloned.segments[segIndex];
  const p1 = cloned.points.find(p => p.id === seg.fromPointId);
  const p2 = cloned.points.find(p => p.id === seg.toPointId);
  if (!p1 || !p2) return cloned;
  
  const newPointId = crypto.randomUUID();
  let newPoint: PathPoint;
  
  if (seg.type === 'LINE') {
    newPoint = {
      id: newPointId,
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
      mode: 'CORNER'
    };
  } else {
    // Cubic bezier De Casteljau
    const h1 = p1.outHandle || p1;
    const h2 = p2.inHandle || p2;
    
    // Level 1
    const q0 = { x: p1.x + (h1.x - p1.x)*t, y: p1.y + (h1.y - p1.y)*t };
    const q1 = { x: h1.x + (h2.x - h1.x)*t, y: h1.y + (h2.y - h1.y)*t };
    const q2 = { x: h2.x + (p2.x - h2.x)*t, y: h2.y + (p2.y - h2.y)*t };
    
    // Level 2
    const r0 = { x: q0.x + (q1.x - q0.x)*t, y: q0.y + (q1.y - q0.y)*t };
    const r1 = { x: q1.x + (q2.x - q1.x)*t, y: q1.y + (q2.y - q1.y)*t };
    
    // Level 3 (point on curve)
    const b = { x: r0.x + (r1.x - r0.x)*t, y: r0.y + (r1.y - r0.y)*t };
    
    // Update existing point handles
    p1.outHandle = q0;
    p2.inHandle = q2;
    
    newPoint = {
      id: newPointId,
      x: b.x,
      y: b.y,
      inHandle: r0,
      outHandle: r1,
      mode: 'SMOOTH'
    };
  }
  
  cloned.points.push(newPoint);
  
  // Replace old segment with two new ones
  const firstSegment: PathSegment = { id: crypto.randomUUID(), type: seg.type, fromPointId: p1.id, toPointId: newPointId };
  const secondSegment: PathSegment = { id: crypto.randomUUID(), type: seg.type, fromPointId: newPointId, toPointId: p2.id };
  cloned.segments.splice(segIndex, 1, firstSegment, secondSegment);
  if (cloned.subpaths) {
    cloned.subpaths = cloned.subpaths.map(subpath => ({
      ...subpath,
      segmentIds: subpath.segmentIds.flatMap(id => id === segmentId ? [firstSegment.id, secondSegment.id] : [id])
    }));
  }
  
  return cloned;
}

export function addPathSegment(geometry: PathGeometry, segment: PathSegment): PathGeometry {
  const cloned = clonePathGeometry(geometry);
  cloned.segments.push(segment);
  return cloned;
}
export function removeOrphanPathPoints(geometry: PathGeometry): PathGeometry {
  const cloned = clonePathGeometry(geometry);
  const referencedPoints = new Set<string>();
  for (const s of cloned.segments) {
    referencedPoints.add(s.fromPointId);
    referencedPoints.add(s.toPointId);
  }
  cloned.points = cloned.points.filter(p => referencedPoints.has(p.id));
  return cloned;
}

/** Splits canonical geometry by segment connectivity. Each returned geometry owns
 * only the points referenced by its connected segments. */
export function splitGeometryIntoConnectedFragments(geometry: PathGeometry): PathGeometry[] {
  if (geometry.segments.length === 0) return [];
  const segmentsByPoint = new Map<string, PathSegment[]>();
  for (const segment of geometry.segments) {
    for (const pointId of [segment.fromPointId, segment.toPointId]) {
      const connected = segmentsByPoint.get(pointId) ?? [];
      connected.push(segment);
      segmentsByPoint.set(pointId, connected);
    }
  }

  const visited = new Set<string>();
  const fragments: PathGeometry[] = [];
  for (const seed of geometry.segments) {
    if (visited.has(seed.id)) continue;
    const queue = [seed];
    const componentSegments: PathSegment[] = [];
    const componentPointIds = new Set<string>();
    while (queue.length > 0) {
      const segment = queue.shift();
      if (!segment || visited.has(segment.id)) continue;
      visited.add(segment.id);
      componentSegments.push({ ...segment });
      componentPointIds.add(segment.fromPointId);
      componentPointIds.add(segment.toPointId);
      for (const pointId of [segment.fromPointId, segment.toPointId]) {
        for (const neighbour of segmentsByPoint.get(pointId) ?? []) {
          if (!visited.has(neighbour.id)) queue.push(neighbour);
        }
      }
    }

    const degree = new Map<string, number>();
    for (const segment of componentSegments) {
      degree.set(segment.fromPointId, (degree.get(segment.fromPointId) ?? 0) + 1);
      degree.set(segment.toPointId, (degree.get(segment.toPointId) ?? 0) + 1);
    }
    const closed = componentSegments.length > 1 && [...componentPointIds].every(pointId => degree.get(pointId) === 2);
    fragments.push({
      points: geometry.points.filter(point => componentPointIds.has(point.id)).map(point => ({
        ...point,
        inHandle: point.inHandle ? { ...point.inHandle } : undefined,
        outHandle: point.outHandle ? { ...point.outHandle } : undefined
      })),
      segments: componentSegments,
      closed
    });
  }
  return fragments;
}

export interface NormalizedPathFragment {
  geometry: PathGeometry;
  position: { xMm: number; yMm: number };
  size: { widthMm: number; heightMm: number };
}

/** Rebases one fragment into its own local bounds while preserving its exact
 * world position under the source element's centre-based rotation. */
export function normalizePathFragment(
  geometry: PathGeometry,
  source: { position: { xMm: number; yMm: number }; size: { widthMm: number; heightMm: number }; rotationDeg: number }
): NormalizedPathFragment {
  const coordinates = geometry.points.flatMap(point => [
    { x: point.x, y: point.y },
    ...(point.inHandle ? [point.inHandle] : []),
    ...(point.outHandle ? [point.outHandle] : [])
  ]);
  const minX = Math.min(...coordinates.map(point => point.x));
  const minY = Math.min(...coordinates.map(point => point.y));
  const maxX = Math.max(...coordinates.map(point => point.x));
  const maxY = Math.max(...coordinates.map(point => point.y));
  const widthMm = Math.max(0.1, maxX - minX);
  const heightMm = Math.max(0.1, maxY - minY);
  const localCentre = { x: minX + widthMm / 2, y: minY + heightMm / 2 };
  const sourceCentre = { x: source.size.widthMm / 2, y: source.size.heightMm / 2 };
  const angle = source.rotationDeg * Math.PI / 180;
  const dx = localCentre.x - sourceCentre.x;
  const dy = localCentre.y - sourceCentre.y;
  const worldCentre = {
    x: source.position.xMm + sourceCentre.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: source.position.yMm + sourceCentre.y + dx * Math.sin(angle) + dy * Math.cos(angle)
  };
  const shift = (point: { x: number; y: number }) => ({ x: point.x - minX, y: point.y - minY });
  return {
    geometry: {
      points: geometry.points.map(point => ({
        ...point,
        x: point.x - minX,
        y: point.y - minY,
        inHandle: point.inHandle ? shift(point.inHandle) : undefined,
        outHandle: point.outHandle ? shift(point.outHandle) : undefined
      })),
      segments: geometry.segments.map(segment => ({ ...segment })),
      closed: geometry.closed
    },
    position: { xMm: worldCentre.x - widthMm / 2, yMm: worldCentre.y - heightMm / 2 },
    size: { widthMm, heightMm }
  };
}

export function trimPathSegment(geometry: PathGeometry, segmentId: string): PathGeometry {
  let cloned = clonePathGeometry(geometry);
  
  // Remove the segment
  cloned.segments = cloned.segments.filter(s => s.id !== segmentId);
  
  // If the path was closed, removing a segment opens it
  if (cloned.closed) {
    cloned.closed = false;
  }
  
  // Clean up orphans
  return removeOrphanPathPoints(cloned);
}

export function getPathEndpoints(geometry: PathGeometry): string[] {
  if (geometry.closed || geometry.segments.length === 0) return [];
  
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  
  for (const p of geometry.points) {
    inDegree.set(p.id, 0);
    outDegree.set(p.id, 0);
  }
  
  for (const s of geometry.segments) {
    outDegree.set(s.fromPointId, (outDegree.get(s.fromPointId) || 0) + 1);
    inDegree.set(s.toPointId, (inDegree.get(s.toPointId) || 0) + 1);
  }
  
  const endpoints: string[] = [];
  for (const p of geometry.points) {
    const isStart = inDegree.get(p.id) === 0 && outDegree.get(p.id) === 1;
    const isEnd = outDegree.get(p.id) === 0 && inDegree.get(p.id) === 1;
    if (isStart || isEnd) {
      endpoints.push(p.id);
    }
  }
  
  return endpoints;
}

/** Returns every deterministic simple segment route between two existing nodes.
 * Open contours normally yield one route; closed contours yield two. */
export function getPathRangeBetweenNodes(geometry: PathGeometry, startNodeId: string, endNodeId: string): string[][] {
  if (startNodeId === endNodeId) return [];
  const pointIds = new Set(geometry.points.map(point => point.id));
  if (!pointIds.has(startNodeId) || !pointIds.has(endNodeId)) return [];
  const adjacency = new Map<string, Array<{ nodeId: string; segmentId: string; order: number }>>();
  geometry.segments.forEach((segment, order) => {
    const from = adjacency.get(segment.fromPointId) ?? [];
    from.push({ nodeId: segment.toPointId, segmentId: segment.id, order });
    adjacency.set(segment.fromPointId, from);
    const to = adjacency.get(segment.toPointId) ?? [];
    to.push({ nodeId: segment.fromPointId, segmentId: segment.id, order });
    adjacency.set(segment.toPointId, to);
  });
  for (const neighbours of adjacency.values()) neighbours.sort((a, b) => a.order - b.order);

  const routes: string[][] = [];
  const visit = (nodeId: string, visitedNodes: Set<string>, route: string[]) => {
    if (routes.length >= 2) return;
    if (nodeId === endNodeId) {
      routes.push([...route]);
      return;
    }
    for (const neighbour of adjacency.get(nodeId) ?? []) {
      if (visitedNodes.has(neighbour.nodeId)) continue;
      visitedNodes.add(neighbour.nodeId);
      route.push(neighbour.segmentId);
      visit(neighbour.nodeId, visitedNodes, route);
      route.pop();
      visitedNodes.delete(neighbour.nodeId);
    }
  };
  visit(startNodeId, new Set([startNodeId]), []);
  return routes;
}

/** Removes only the requested canonical segments and keeps all unrelated
 * topology untouched. Fragment splitting is intentionally a separate step. */
export function deletePathSegmentRange(geometry: PathGeometry, segmentIds: string[]): PathGeometry {
  const removeIds = new Set(segmentIds);
  if (removeIds.size === 0) return clonePathGeometry(geometry);
  const cloned = clonePathGeometry(geometry);
  cloned.segments = cloned.segments.filter(segment => !removeIds.has(segment.id));
  cloned.closed = false;
  if (cloned.subpaths) {
    cloned.subpaths = cloned.subpaths
      .map(subpath => ({
        ...subpath,
        closed: subpath.segmentIds.some(segmentId => removeIds.has(segmentId)) ? false : subpath.closed,
        segmentIds: subpath.segmentIds.filter(segmentId => !removeIds.has(segmentId))
      }))
      .filter(subpath => subpath.segmentIds.length > 0);
  }
  return removeOrphanPathPoints(cloned);
}

export function closePathGeometry(geometry: PathGeometry): PathGeometry {
  const endpoints = getPathEndpoints(geometry);
  if (endpoints.length !== 2) return geometry; // Can only close if exactly 2 endpoints
  
  const cloned = clonePathGeometry(geometry);
  
  // We need to figure out which is start and which is end to direct the segment correctly.
  // We can just rely on the in/out degree logic.
  let startNode = '';
  let endNode = '';
  
  const outDegree = new Map<string, number>();
  for (const s of geometry.segments) outDegree.set(s.fromPointId, (outDegree.get(s.fromPointId) || 0) + 1);
  
  for (const ep of endpoints) {
    if ((outDegree.get(ep) || 0) === 0) {
       endNode = ep;
    } else {
       startNode = ep;
    }
  }
  
  if (startNode && endNode) {
    cloned.segments.push({ id: crypto.randomUUID(), type: 'LINE', fromPointId: endNode, toPointId: startNode });
    cloned.closed = true;
  }
  
  return cloned;
}
export function deletePathSegment(geometry: PathGeometry, id: string): PathGeometry {
  const cloned = clonePathGeometry(geometry);
  cloned.segments = cloned.segments.filter(s => s.id !== id);
  return cloned;
}

export function hitTestSegment(geometry: PathGeometry, segmentId: string, pt: {x: number, y: number}): {t: number, distance: number} {
  const seg = geometry.segments.find(s => s.id === segmentId);
  if (!seg) return { t: 0, distance: Infinity };
  
  const p1 = geometry.points.find(p => p.id === seg.fromPointId);
  const p2 = geometry.points.find(p => p.id === seg.toPointId);
  if (!p1 || !p2) return { t: 0, distance: Infinity };
  
  if (seg.type === 'LINE') {
    const l2 = (p2.x - p1.x)**2 + (p2.y - p1.y)**2;
    if (l2 === 0) return { t: 0, distance: Math.hypot(pt.x - p1.x, pt.y - p1.y) };
    let t = ((pt.x - p1.x)*(p2.x - p1.x) + (pt.y - p1.y)*(p2.y - p1.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const proj = { x: p1.x + t*(p2.x - p1.x), y: p1.y + t*(p2.y - p1.y) };
    return { t, distance: Math.hypot(pt.x - proj.x, pt.y - proj.y) };
  } else {
    // Cubic: adaptive sampling
    const h1 = p1.outHandle || p1;
    const h2 = p2.inHandle || p2;
    
    let bestT = 0;
    let minDistance = Infinity;
    
    // Sample 100 points
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const mt = 1 - t;
      const x = mt**3 * p1.x + 3 * mt**2 * t * h1.x + 3 * mt * t**2 * h2.x + t**3 * p2.x;
      const y = mt**3 * p1.y + 3 * mt**2 * t * h1.y + 3 * mt * t**2 * h2.y + t**3 * p2.y;
      
      const dist = Math.hypot(pt.x - x, pt.y - y);
      if (dist < minDistance) {
        minDistance = dist;
        bestT = t;
      }
    }
    
    return { t: bestT, distance: minDistance };
  }
}


export type PathSymmetryAxis = 'OFF' | 'H' | 'V';

export interface SymmetricPathInsertResult {
  geometry: PathGeometry;
  insertedPointIds: string[];
  mirroredPointId?: string;
  mirroredCreated: boolean;
}

/**
 * Split one path segment and, when symmetry is enabled, also create/select the
 * exact counterpart on the opposite boundary around the supplied local center.
 *
 * H mirrors across the vertical center line (left/right pairing).
 * V mirrors across the horizontal center line (top/bottom pairing).
 */
export function insertPathNodeWithSymmetry(
  geometry: PathGeometry,
  segmentId: string,
  t: number,
  mode: PathSymmetryAxis,
  center: {x: number; y: number},
  mirrorHitTolerance = 1.25,
): SymmetricPathInsertResult {
  const clampedT = Math.max(0.001, Math.min(0.999, t));
  const beforeIds = new Set(geometry.points.map(point => point.id));
  let nextGeometry = splitPathSegment(geometry, segmentId, clampedT);
  const inserted = nextGeometry.points.find(point => !beforeIds.has(point.id));
  if (!inserted) return {geometry, insertedPointIds: [], mirroredCreated: false};

  if (mode === 'OFF') {
    return {geometry: nextGeometry, insertedPointIds: [inserted.id], mirroredCreated: false};
  }

  const mirroredTarget = mode === 'H'
    ? {x: 2 * center.x - inserted.x, y: inserted.y}
    : {x: inserted.x, y: 2 * center.y - inserted.y};

  // If the exact counterpart is already represented by a node, reuse it.
  let existingMirror: PathPoint | undefined;
  let existingDistance = Infinity;
  for (const point of nextGeometry.points) {
    if (point.id === inserted.id) continue;
    const distance = Math.hypot(point.x - mirroredTarget.x, point.y - mirroredTarget.y);
    if (distance < existingDistance) {
      existingDistance = distance;
      existingMirror = point;
    }
  }
  if (existingMirror && existingDistance <= mirrorHitTolerance) {
    return {
      geometry: nextGeometry,
      insertedPointIds: [inserted.id, existingMirror.id],
      mirroredPointId: existingMirror.id,
      mirroredCreated: false,
    };
  }

  // Find the opposite boundary segment nearest to the exact mirrored target.
  // Avoid the freshly split source-side segments so an insertion near center
  // cannot accidentally split the same side again.
  const sourceAdjacentIds = new Set(
    nextGeometry.segments
      .filter(segment => segment.fromPointId === inserted.id || segment.toPointId === inserted.id)
      .map(segment => segment.id),
  );
  let best: {segmentId: string; t: number; distance: number} | undefined;
  for (const segment of nextGeometry.segments) {
    if (sourceAdjacentIds.has(segment.id)) continue;
    const hit = hitTestSegment(nextGeometry, segment.id, mirroredTarget);
    if (hit.t <= 0.001 || hit.t >= 0.999) continue;
    if (!best || hit.distance < best.distance) best = {segmentId: segment.id, t: hit.t, distance: hit.distance};
  }
  if (!best || best.distance > mirrorHitTolerance) {
    return {geometry: nextGeometry, insertedPointIds: [inserted.id], mirroredCreated: false};
  }

  const beforeMirrorIds = new Set(nextGeometry.points.map(point => point.id));
  nextGeometry = splitPathSegment(nextGeometry, best.segmentId, best.t);
  const mirroredInserted = nextGeometry.points.find(point => !beforeMirrorIds.has(point.id));
  if (!mirroredInserted) {
    return {geometry: nextGeometry, insertedPointIds: [inserted.id], mirroredCreated: false};
  }

  // Enforce exact center symmetry for the node coordinate. For a straight
  // opposite edge this is already exact; this correction also removes tiny
  // hit-test sampling drift on curves while preserving split handles/segments.
  nextGeometry = {
    ...nextGeometry,
    points: nextGeometry.points.map(point => point.id === mirroredInserted.id
      ? {...point, x: mirroredTarget.x, y: mirroredTarget.y}
      : point),
  };

  return {
    geometry: nextGeometry,
    insertedPointIds: [inserted.id, mirroredInserted.id],
    mirroredPointId: mirroredInserted.id,
    mirroredCreated: true,
  };
}

export function localToWorld(pt: {x: number, y: number}, element: {position: {xMm: number, yMm: number}, size: {widthMm: number, heightMm: number}, rotationDeg: number}): {x: number, y: number} {
  const rad = element.rotationDeg * Math.PI / 180;
  
  // Element is positioned at its top-left corner in world space, but rotation happens around its center
  const cx = element.size.widthMm / 2;
  const cy = element.size.heightMm / 2;
  
  // Translate point to origin (relative to center)
  const tx = pt.x - cx;
  const ty = pt.y - cy;
  
  // Rotate
  const rx = tx * Math.cos(rad) - ty * Math.sin(rad);
  const ry = tx * Math.sin(rad) + ty * Math.cos(rad);
  
  // Translate back to element position + center
  return {
    x: element.position.xMm + cx + rx,
    y: element.position.yMm + cy + ry
  };
}

export function worldToLocal(pt: {x: number, y: number}, element: {position: {xMm: number, yMm: number}, size: {widthMm: number, heightMm: number}, rotationDeg: number}): {x: number, y: number} {
  const rad = -element.rotationDeg * Math.PI / 180;
  
  const cx = element.position.xMm + element.size.widthMm / 2;
  const cy = element.position.yMm + element.size.heightMm / 2;
  
  const tx = pt.x - cx;
  const ty = pt.y - cy;
  
  const rx = tx * Math.cos(rad) - ty * Math.sin(rad);
  const ry = tx * Math.sin(rad) + ty * Math.cos(rad);
  
  return {
    x: rx + element.size.widthMm / 2,
    y: ry + element.size.heightMm / 2
  };
}

export function joinPathGeometries(geoA: PathGeometry, geoB: PathGeometry, elA: any, elB: any): { geometry: PathGeometry, boundingBox: {xMm: number, yMm: number, widthMm: number, heightMm: number} } {
  // Convert all points of A to world
  const ptsA = geoA.points.map(p => {
    const w = localToWorld(p, elA);
    const inH = p.inHandle ? localToWorld(p.inHandle, elA) : undefined;
    const outH = p.outHandle ? localToWorld(p.outHandle, elA) : undefined;
    return { ...p, x: w.x, y: w.y, inHandle: inH, outHandle: outH };
  });
  
  // Convert all points of B to world
  const ptsB = geoB.points.map(p => {
    const w = localToWorld(p, elB);
    const inH = p.inHandle ? localToWorld(p.inHandle, elB) : undefined;
    const outH = p.outHandle ? localToWorld(p.outHandle, elB) : undefined;
    return { ...p, x: w.x, y: w.y, inHandle: inH, outHandle: outH };
  });

  // Calculate new bounding box (unrotated for simplicity, as per 6.0.3 design)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  [...ptsA, ...ptsB].forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });
  
  const bb = { xMm: minX, yMm: minY, widthMm: maxX - minX, heightMm: maxY - minY };
  const mockEl = { position: { xMm: bb.xMm, yMm: bb.yMm }, size: { widthMm: bb.widthMm, heightMm: bb.heightMm }, rotationDeg: 0 };

  // Convert A and B to new local space
  const newPtsA = ptsA.map(p => {
    const l = worldToLocal(p, mockEl);
    const inH = p.inHandle ? worldToLocal(p.inHandle, mockEl) : undefined;
    const outH = p.outHandle ? worldToLocal(p.outHandle, mockEl) : undefined;
    return { ...p, x: l.x, y: l.y, inHandle: inH, outHandle: outH };
  });
  
  const newPtsB = ptsB.map(p => {
    const id = crypto.randomUUID(); // Remap IDs
    return { oldId: p.id, newId: id, point: p };
  });
  
  const mappedPtsB = newPtsB.map(item => {
    const p = item.point;
    const l = worldToLocal(p, mockEl);
    const inH = p.inHandle ? worldToLocal(p.inHandle, mockEl) : undefined;
    const outH = p.outHandle ? worldToLocal(p.outHandle, mockEl) : undefined;
    return { ...p, id: item.newId, x: l.x, y: l.y, inHandle: inH, outHandle: outH };
  });
  
  const idMapB = new Map(newPtsB.map(item => [item.oldId, item.newId]));
  
  const segsB = geoB.segments.map(s => ({
    ...s,
    id: crypto.randomUUID(),
    fromPointId: idMapB.get(s.fromPointId)!,
    toPointId: idMapB.get(s.toPointId)!
  }));
  
  const geometry: PathGeometry = {
    points: [...newPtsA, ...mappedPtsB],
    segments: [...geoA.segments, ...segsB],
    closed: false
  };
  
  // Find closest endpoints
  const epA = getPathEndpoints({ points: newPtsA, segments: geoA.segments, closed: false });
  const epB = getPathEndpoints({ points: mappedPtsB, segments: segsB, closed: false });
  
  if (epA.length > 0 && epB.length > 0) {
    let closestA = epA[0], closestB = epB[0], minDist = Infinity;
    
    for (const ea of epA) {
      for (const eb of epB) {
        const pa = geometry.points.find(p=>p.id===ea)!;
        const pb = geometry.points.find(p=>p.id===eb)!;
        const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (dist < minDist) {
          minDist = dist;
          closestA = ea;
          closestB = eb;
        }
      }
    }
    
    // Connect them
    const outDegree = new Map<string, number>();
    for (const s of geometry.segments) outDegree.set(s.fromPointId, (outDegree.get(s.fromPointId) || 0) + 1);
    
    const startNode = (outDegree.get(closestA) || 0) === 0 ? closestA : closestB;
    const endNode = startNode === closestA ? closestB : closestA;
    
    geometry.segments.push({ id: crypto.randomUUID(), type: 'LINE', fromPointId: startNode, toPointId: endNode });
  }

  return { geometry, boundingBox: bb };
}

export function geometryToSvgPath(geometry: PathGeometry): string {
  if (geometry.points.length === 0 || geometry.segments.length === 0) return '';
  
  const pointMap = new Map<string, PathPoint>(geometry.points.map(p => [p.id, p]));
  
  let d = '';
  
  if (geometry.subpaths && geometry.subpaths.length > 0) {
    for (const sub of geometry.subpaths) {
      const segs = sub.segmentIds.map(id => geometry.segments.find(s => s.id === id)).filter(s => s !== undefined) as PathSegment[];
      d += renderSegments(segs, pointMap, sub.closed);
    }
  } else {
    d += renderSegments(geometry.segments, pointMap, geometry.closed);
  }
  
  return d.trim();
}

function renderSegments(segments: PathSegment[], pointMap: Map<string, PathPoint>, closed: boolean): string {
  if (segments.length === 0) return '';
  let d = '';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const fromPoint = pointMap.get(seg.fromPointId);
    const toPoint = pointMap.get(seg.toPointId);
    
    if (!fromPoint || !toPoint) continue;
    
    if (i === 0) {
      d += `M ${fromPoint.x} ${fromPoint.y} `;
    } else {
      const prevSeg = segments[i - 1];
      if (prevSeg.toPointId !== seg.fromPointId) {
        d += `M ${fromPoint.x} ${fromPoint.y} `;
      }
    }
    
    if (seg.type === 'LINE') {
      d += `L ${toPoint.x} ${toPoint.y} `;
    } else if (seg.type === 'CUBIC_BEZIER') {
      const cp1x = fromPoint.outHandle ? fromPoint.outHandle.x : fromPoint.x;
      const cp1y = fromPoint.outHandle ? fromPoint.outHandle.y : fromPoint.y;
      const cp2x = toPoint.inHandle ? toPoint.inHandle.x : toPoint.x;
      const cp2y = toPoint.inHandle ? toPoint.inHandle.y : toPoint.y;
      d += `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toPoint.x} ${toPoint.y} `;
    }
  }
  if (closed) d += 'Z ';
  return d;
}

export function shapeToPathGeometry(shapeType: string, sizeMm: {widthMm: number, heightMm: number}): PathGeometry {
  const points: PathPoint[] = [];
  const segments: PathSegment[] = [];
  
  const w = sizeMm.widthMm;
  const h = sizeMm.heightMm;
  const addClosedPolygon = (coordinates: Array<{ x: number; y: number }>) => {
    const ids = coordinates.map(() => crypto.randomUUID());
    coordinates.forEach((coordinate, index) => points.push({ id: ids[index]!, ...coordinate, mode: 'CORNER' }));
    coordinates.forEach((_, index) => segments.push({
      id: crypto.randomUUID(), type: 'LINE', fromPointId: ids[index]!, toPointId: ids[(index + 1) % ids.length]!
    }));
  };
  
  if (shapeType === 'RECTANGLE' || shapeType === 'SQUARE') {
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    points.push({ id: ids[0]!, x: 0, y: 0, mode: 'CORNER' });
    points.push({ id: ids[1]!, x: w, y: 0, mode: 'CORNER' });
    points.push({ id: ids[2]!, x: w, y: h, mode: 'CORNER' });
    points.push({ id: ids[3]!, x: 0, y: h, mode: 'CORNER' });
    
    segments.push({ id: crypto.randomUUID(), type: 'LINE', fromPointId: ids[0]!, toPointId: ids[1]! });
    segments.push({ id: crypto.randomUUID(), type: 'LINE', fromPointId: ids[1]!, toPointId: ids[2]! });
    segments.push({ id: crypto.randomUUID(), type: 'LINE', fromPointId: ids[2]!, toPointId: ids[3]! });
    segments.push({ id: crypto.randomUUID(), type: 'LINE', fromPointId: ids[3]!, toPointId: ids[0]! });
  } else if (shapeType === 'ROUNDED_RECTANGLE') {
    const radius = Math.min(w, h) * 0.15;
    const handle = radius * 0.552284749831;
    const ids = Array.from({ length: 8 }, () => crypto.randomUUID());
    points.push(
      { id: ids[0]!, x: radius, y: 0, mode: 'CORNER' },
      { id: ids[1]!, x: w - radius, y: 0, mode: 'CORNER', outHandle: { x: w - radius + handle, y: 0 } },
      { id: ids[2]!, x: w, y: radius, mode: 'CORNER', inHandle: { x: w, y: radius - handle } },
      { id: ids[3]!, x: w, y: h - radius, mode: 'CORNER', outHandle: { x: w, y: h - radius + handle } },
      { id: ids[4]!, x: w - radius, y: h, mode: 'CORNER', inHandle: { x: w - radius + handle, y: h } },
      { id: ids[5]!, x: radius, y: h, mode: 'CORNER', outHandle: { x: radius - handle, y: h } },
      { id: ids[6]!, x: 0, y: h - radius, mode: 'CORNER', inHandle: { x: 0, y: h - radius + handle } },
      { id: ids[7]!, x: 0, y: radius, mode: 'CORNER', outHandle: { x: 0, y: radius - handle }, inHandle: undefined }
    );
    const types: PathSegment['type'][] = ['LINE', 'CUBIC_BEZIER', 'LINE', 'CUBIC_BEZIER', 'LINE', 'CUBIC_BEZIER', 'LINE', 'CUBIC_BEZIER'];
    types.forEach((type, index) => segments.push({ id: crypto.randomUUID(), type, fromPointId: ids[index]!, toPointId: ids[(index + 1) % ids.length]! }));
    points[0]!.inHandle = { x: radius - handle, y: 0 };
  } else if (shapeType === 'ELLIPSE' || shapeType === 'CIRCLE') {
    const kappa = 0.552284749831;
    const cx = w/2, cy = h/2, rx = w/2, ry = h/2;
    const kx = kappa * rx, ky = kappa * ry;
    
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    
    points.push({ id: ids[0]!, x: cx, y: 0, mode: 'SYMMETRIC', inHandle: {x: cx - kx, y: 0}, outHandle: {x: cx + kx, y: 0} });
    points.push({ id: ids[1]!, x: w, y: cy, mode: 'SYMMETRIC', inHandle: {x: w, y: cy - ky}, outHandle: {x: w, y: cy + ky} });
    points.push({ id: ids[2]!, x: cx, y: h, mode: 'SYMMETRIC', inHandle: {x: cx + kx, y: h}, outHandle: {x: cx - kx, y: h} });
    points.push({ id: ids[3]!, x: 0, y: cy, mode: 'SYMMETRIC', inHandle: {x: 0, y: cy + ky}, outHandle: {x: 0, y: cy - ky} });
    
    segments.push({ id: crypto.randomUUID(), type: 'CUBIC_BEZIER', fromPointId: ids[0]!, toPointId: ids[1]! });
    segments.push({ id: crypto.randomUUID(), type: 'CUBIC_BEZIER', fromPointId: ids[1]!, toPointId: ids[2]! });
    segments.push({ id: crypto.randomUUID(), type: 'CUBIC_BEZIER', fromPointId: ids[2]!, toPointId: ids[3]! });
    segments.push({ id: crypto.randomUUID(), type: 'CUBIC_BEZIER', fromPointId: ids[3]!, toPointId: ids[0]! });
  } else if (shapeType === 'TRIANGLE') {
    addClosedPolygon([{ x: w / 2, y: 0 }, { x: w, y: h }, { x: 0, y: h }]);
  } else if (shapeType === 'RIGHT_TRIANGLE') {
    addClosedPolygon([{ x: 0, y: 0 }, { x: w, y: h }, { x: 0, y: h }]);
  } else if (shapeType === 'DIAMOND') {
    addClosedPolygon([{ x: w/2, y: 0 }, { x: w, y: h/2 }, { x: w/2, y: h }, { x: 0, y: h/2 }]);
  } else if (shapeType === 'PENTAGON') {
    addClosedPolygon(Array.from({length:5},(_,i)=>{const a=-Math.PI/2+i*2*Math.PI/5;return{x:w*(.5+.48*Math.cos(a)),y:h*(.5+.48*Math.sin(a))}}));
  } else if (shapeType === 'HEXAGON') {
    addClosedPolygon([{x:w*.25,y:0},{x:w*.75,y:0},{x:w,y:h*.5},{x:w*.75,y:h},{x:w*.25,y:h},{x:0,y:h*.5}]);
  } else if (shapeType === 'OCTAGON') {
    addClosedPolygon([{x:w*.29,y:0},{x:w*.71,y:0},{x:w,y:h*.29},{x:w,y:h*.71},{x:w*.71,y:h},{x:w*.29,y:h},{x:0,y:h*.71},{x:0,y:h*.29}]);
  } else if (shapeType === 'TRAPEZOID') {
    addClosedPolygon([{x:w*.2,y:0},{x:w*.8,y:0},{x:w,y:h},{x:0,y:h}]);
  } else if (shapeType === 'PARALLELOGRAM') {
    addClosedPolygon([{x:w*.2,y:0},{x:w,y:0},{x:w*.8,y:h},{x:0,y:h}]);
  } else if (shapeType === 'CHEVRON') {
    addClosedPolygon([{x:0,y:0},{x:w*.58,y:0},{x:w,y:h*.5},{x:w*.58,y:h},{x:0,y:h},{x:w*.42,y:h*.5}]);
  } else if (shapeType === 'DOUBLE_CHEVRON') {
    addClosedPolygon([{x:0,y:0},{x:w*.28,y:0},{x:w*.5,y:h*.5},{x:w*.28,y:h},{x:0,y:h},{x:w*.22,y:h*.5},{x:0,y:0}]);
    // second chevron is intentionally represented in the same closed outline for stable fill/export
    points.length=0; segments.length=0;
    addClosedPolygon([{x:0,y:0},{x:w*.28,y:0},{x:w*.5,y:h*.5},{x:w*.28,y:h},{x:0,y:h},{x:w*.22,y:h*.5},{x:w*.5,y:0},{x:w*.78,y:0},{x:w,y:h*.5},{x:w*.78,y:h},{x:w*.5,y:h},{x:w*.72,y:h*.5}]);
  } else if (shapeType === 'DOUBLE_ARROW') {
    addClosedPolygon([{x:0,y:h*.5},{x:w*.2,y:0},{x:w*.2,y:h*.32},{x:w*.8,y:h*.32},{x:w*.8,y:0},{x:w,y:h*.5},{x:w*.8,y:h},{x:w*.8,y:h*.68},{x:w*.2,y:h*.68},{x:w*.2,y:h}]);
  } else if (shapeType === 'CROSS' || shapeType === 'PLUS') {
    addClosedPolygon([{x:w*.36,y:0},{x:w*.64,y:0},{x:w*.64,y:h*.36},{x:w,y:h*.36},{x:w,y:h*.64},{x:w*.64,y:h*.64},{x:w*.64,y:h},{x:w*.36,y:h},{x:w*.36,y:h*.64},{x:0,y:h*.64},{x:0,y:h*.36},{x:w*.36,y:h*.36}]);
  } else if (shapeType === 'BANNER') {
    addClosedPolygon([{x:0,y:h*.1},{x:w,y:h*.1},{x:w*.88,y:h*.5},{x:w,y:h*.9},{x:0,y:h*.9},{x:w*.12,y:h*.5}]);
  } else if (shapeType === 'SHIELD') {
    addClosedPolygon([{x:w*.5,y:0},{x:w,y:h*.15},{x:w*.88,y:h*.65},{x:w*.5,y:h},{x:w*.12,y:h*.65},{x:0,y:h*.15}]);
  } else if (shapeType === 'LABEL_TAG') {
    addClosedPolygon([{x:0,y:0},{x:w*.78,y:0},{x:w,y:h*.5},{x:w*.78,y:h},{x:0,y:h}]);
  } else if (shapeType === 'DOCUMENT') {
    addClosedPolygon([{x:0,y:0},{x:w*.75,y:0},{x:w,y:h*.25},{x:w,y:h},{x:0,y:h}]);
  } else if (shapeType === 'BRACKET') {
    addClosedPolygon([{x:w*.18,y:0},{x:w*.48,y:0},{x:w*.48,y:h*.12},{x:w*.3,y:h*.12},{x:w*.3,y:h*.88},{x:w*.48,y:h*.88},{x:w*.48,y:h},{x:w*.18,y:h}]);
  } else if (shapeType === 'SPEECH_BUBBLE' || shapeType === 'CALLOUT') {
    addClosedPolygon([{x:0,y:0},{x:w,y:0},{x:w,y:h*.75},{x:w*.62,y:h*.75},{x:w*.48,y:h},{x:w*.42,y:h*.75},{x:0,y:h*.75}]);
  } else if (shapeType === 'HEART') {
    const ids=Array.from({length:4},()=>crypto.randomUUID());
    points.push(
      {id:ids[0]!,x:w*.5,y:h,mode:'CORNER'},
      {id:ids[1]!,x:0,y:h*.32,mode:'SMOOTH',outHandle:{x:0,y:0}},
      {id:ids[2]!,x:w*.5,y:h*.24,mode:'SMOOTH',inHandle:{x:w*.18,y:0},outHandle:{x:w*.82,y:0}},
      {id:ids[3]!,x:w,y:h*.32,mode:'SMOOTH',inHandle:{x:w,y:0}}
    );
    segments.push(
      {id:crypto.randomUUID(),type:'CUBIC_BEZIER',fromPointId:ids[0]!,toPointId:ids[1]!},
      {id:crypto.randomUUID(),type:'CUBIC_BEZIER',fromPointId:ids[1]!,toPointId:ids[2]!},
      {id:crypto.randomUUID(),type:'CUBIC_BEZIER',fromPointId:ids[2]!,toPointId:ids[3]!},
      {id:crypto.randomUUID(),type:'CUBIC_BEZIER',fromPointId:ids[3]!,toPointId:ids[0]!}
    );
  } else if (shapeType === 'CLOUD') {
    addClosedPolygon([{x:w*.1,y:h*.7},{x:0,y:h*.52},{x:w*.12,y:h*.35},{x:w*.28,y:h*.36},{x:w*.38,y:h*.12},{x:w*.6,y:h*.08},{x:w*.72,y:h*.28},{x:w*.9,y:h*.3},{x:w,y:h*.5},{x:w*.9,y:h*.72}]);
  } else if (shapeType === 'CYLINDER') {
    addClosedPolygon([{x:w*.08,y:h*.12},{x:w*.22,y:0},{x:w*.78,y:0},{x:w*.92,y:h*.12},{x:w*.92,y:h*.88},{x:w*.78,y:h},{x:w*.22,y:h},{x:w*.08,y:h*.88}]);
  } else if (shapeType === 'CURVED_ARROW') {
    addClosedPolygon([{x:0,y:h*.82},{x:w*.14,y:h*.45},{x:w*.48,y:h*.28},{x:w*.72,y:h*.3},{x:w*.72,y:0},{x:w,y:h*.34},{x:w*.72,y:h*.68},{x:w*.72,y:h*.48},{x:w*.5,y:h*.46},{x:w*.24,y:h*.58}]);
  } else if (shapeType === 'CAPSULE') {
    const r=Math.min(w/2,h/2),k=r*.552284749831,ids=Array.from({length:8},()=>crypto.randomUUID());
    points.push(
      {id:ids[0]!,x:r,y:0,mode:'CORNER'},
      {id:ids[1]!,x:w-r,y:0,mode:'CORNER',outHandle:{x:w-r+k,y:0}},
      {id:ids[2]!,x:w,y:r,mode:'CORNER',inHandle:{x:w,y:r-k}},
      {id:ids[3]!,x:w,y:h-r,mode:'CORNER',outHandle:{x:w,y:h-r+k}},
      {id:ids[4]!,x:w-r,y:h,mode:'CORNER',inHandle:{x:w-r+k,y:h}},
      {id:ids[5]!,x:r,y:h,mode:'CORNER',outHandle:{x:r-k,y:h}},
      {id:ids[6]!,x:0,y:h-r,mode:'CORNER',inHandle:{x:0,y:h-r+k}},
      {id:ids[7]!,x:0,y:r,mode:'CORNER',outHandle:{x:0,y:r-k}}
    );
    points[0]!.inHandle={x:r-k,y:0};
    const types:PathSegment['type'][]=['LINE','CUBIC_BEZIER','LINE','CUBIC_BEZIER','LINE','CUBIC_BEZIER','LINE','CUBIC_BEZIER'];
    types.forEach((type,index)=>segments.push({id:crypto.randomUUID(),type,fromPointId:ids[index]!,toPointId:ids[(index+1)%ids.length]!}));
  } else if (shapeType === 'WAVE') {
    // A closed ribbon-like wave: two smooth cubic chains joined by straight
    // sides. Keeping six stable anchors makes the converted shape practical
    // to edit while preserving the live shape's full width/height bounds.
    const ids=Array.from({length:6},()=>crypto.randomUUID());
    const handleX=w*.18;
    points.push(
      {id:ids[0]!,x:0,y:h*.35,mode:'SMOOTH',outHandle:{x:handleX,y:h*.05}},
      {id:ids[1]!,x:w*.5,y:h*.15,mode:'SMOOTH',inHandle:{x:w*.5-handleX,y:h*.15},outHandle:{x:w*.5+handleX,y:h*.15}},
      {id:ids[2]!,x:w,y:h*.35,mode:'SMOOTH',inHandle:{x:w-handleX,y:h*.65}},
      {id:ids[3]!,x:w,y:h*.75,mode:'SMOOTH',outHandle:{x:w-handleX,y:h*.45}},
      {id:ids[4]!,x:w*.5,y:h*.55,mode:'SMOOTH',inHandle:{x:w*.5+handleX,y:h*.55},outHandle:{x:w*.5-handleX,y:h*.55}},
      {id:ids[5]!,x:0,y:h*.75,mode:'SMOOTH',inHandle:{x:handleX,y:h*1.05}}
    );
    segments.push(
      {id:crypto.randomUUID(),type:'CUBIC_BEZIER',fromPointId:ids[0]!,toPointId:ids[1]!},
      {id:crypto.randomUUID(),type:'CUBIC_BEZIER',fromPointId:ids[1]!,toPointId:ids[2]!},
      {id:crypto.randomUUID(),type:'LINE',fromPointId:ids[2]!,toPointId:ids[3]!},
      {id:crypto.randomUUID(),type:'CUBIC_BEZIER',fromPointId:ids[3]!,toPointId:ids[4]!},
      {id:crypto.randomUUID(),type:'CUBIC_BEZIER',fromPointId:ids[4]!,toPointId:ids[5]!},
      {id:crypto.randomUUID(),type:'LINE',fromPointId:ids[5]!,toPointId:ids[0]!}
    );
  } else if (shapeType === 'POLYGON') {
    addClosedPolygon([{ x: w * 0.25, y: 0 }, { x: w * 0.75, y: 0 }, { x: w, y: h * 0.5 }, { x: w * 0.75, y: h }, { x: w * 0.25, y: h }, { x: 0, y: h * 0.5 }]);
  } else if (shapeType === 'STAR') {
    const coordinates = Array.from({ length: 10 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI / 5;
      const radius = index % 2 === 0 ? 0.5 : 0.22;
      return { x: w * (0.5 + Math.cos(angle) * radius), y: h * (0.5 + Math.sin(angle) * radius) };
    });
    addClosedPolygon(coordinates);
  } else if (shapeType === 'ARROW') {
    addClosedPolygon([{ x: 0, y: h * 0.35 }, { x: w * 0.62, y: h * 0.35 }, { x: w * 0.62, y: h * 0.15 }, { x: w, y: h * 0.5 }, { x: w * 0.62, y: h * 0.85 }, { x: w * 0.62, y: h * 0.65 }, { x: 0, y: h * 0.65 }]);
  } else if (shapeType === 'RIBBON') {
    addClosedPolygon([{ x: 0, y: h * 0.2 }, { x: w * 0.2, y: h * 0.2 }, { x: w * 0.2, y: h * 0.08 }, { x: w * 0.8, y: h * 0.08 }, { x: w * 0.8, y: h * 0.2 }, { x: w, y: h * 0.2 }, { x: w * 0.88, y: h * 0.5 }, { x: w, y: h * 0.8 }, { x: w * 0.8, y: h * 0.8 }, { x: w * 0.8, y: h * 0.92 }, { x: w * 0.2, y: h * 0.92 }, { x: w * 0.2, y: h * 0.8 }, { x: 0, y: h * 0.8 }, { x: w * 0.12, y: h * 0.5 }]);
  } else if (shapeType === 'BADGE') {
    const coordinates = Array.from({ length: 16 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI / 8;
      const radius = index % 2 === 0 ? 0.5 : 0.42;
      return { x: w * (0.5 + Math.cos(angle) * radius), y: h * (0.5 + Math.sin(angle) * radius) };
    });
    addClosedPolygon(coordinates);
  } else if (shapeType === 'ARC') {
    const ids=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
    points.push({id:ids[0]!,x:0,y:h,mode:'CORNER',outHandle:{x:0,y:h*.35}},{id:ids[1]!,x:w/2,y:0,mode:'SMOOTH',inHandle:{x:w*.18,y:0},outHandle:{x:w*.82,y:0}},{id:ids[2]!,x:w,y:h,mode:'CORNER',inHandle:{x:w,y:h*.35}});
    segments.push({id:crypto.randomUUID(),type:'CUBIC_BEZIER',fromPointId:ids[0]!,toPointId:ids[1]!},{id:crypto.randomUUID(),type:'CUBIC_BEZIER',fromPointId:ids[1]!,toPointId:ids[2]!});
  } else if (shapeType === 'LINE') {
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    points.push({ id: ids[0]!, x: 0, y: 0, mode: 'CORNER' });
    points.push({ id: ids[1]!, x: w, y: h, mode: 'CORNER' });
    segments.push({ id: crypto.randomUUID(), type: 'LINE', fromPointId: ids[0]!, toPointId: ids[1]! });
  } else if (shapeType === 'HALF_CIRCLE') {
    const kappa = 0.552284749831;
    const cx = w/2, rx = w/2, ry = h;
    const kx = kappa * rx, ky = kappa * ry;
    
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    
    // Left point (start)
    points.push({ id: ids[0]!, x: 0, y: h, mode: 'CORNER', outHandle: {x: 0, y: h - ky} });
    // Top point
    points.push({ id: ids[1]!, x: cx, y: 0, mode: 'SYMMETRIC', inHandle: {x: cx - kx, y: 0}, outHandle: {x: cx + kx, y: 0} });
    // Right point
    points.push({ id: ids[2]!, x: w, y: h, mode: 'CORNER', inHandle: {x: w, y: h - ky} });
    
    segments.push({ id: crypto.randomUUID(), type: 'CUBIC_BEZIER', fromPointId: ids[0]!, toPointId: ids[1]! });
    segments.push({ id: crypto.randomUUID(), type: 'CUBIC_BEZIER', fromPointId: ids[1]!, toPointId: ids[2]! });
    segments.push({ id: crypto.randomUUID(), type: 'LINE', fromPointId: ids[2]!, toPointId: ids[0]! });
  } else {
    // Fallback for unsupported shapes
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    points.push({ id: ids[0]!, x: 0, y: 0, mode: 'CORNER' });
    points.push({ id: ids[1]!, x: w, y: 0, mode: 'CORNER' });
    points.push({ id: ids[2]!, x: w, y: h, mode: 'CORNER' });
    points.push({ id: ids[3]!, x: 0, y: h, mode: 'CORNER' });
    segments.push({ id: crypto.randomUUID(), type: 'LINE', fromPointId: ids[0]!, toPointId: ids[1]! });
    segments.push({ id: crypto.randomUUID(), type: 'LINE', fromPointId: ids[1]!, toPointId: ids[2]! });
    segments.push({ id: crypto.randomUUID(), type: 'LINE', fromPointId: ids[2]!, toPointId: ids[3]! });
    segments.push({ id: crypto.randomUUID(), type: 'LINE', fromPointId: ids[3]!, toPointId: ids[0]! });
  }
  
  return { points, segments, closed: shapeType !== 'LINE' && shapeType !== 'FLEXIBLE_LINE' && shapeType !== 'ARC' };
}


export function convertPathSegmentToLine(geometry: PathGeometry, segmentId: string): PathGeometry {
  const cloned = clonePathGeometry(geometry);
  const segment = cloned.segments.find(candidate => candidate.id === segmentId);
  if (!segment || segment.type === 'LINE') return cloned;
  const fromPoint = cloned.points.find(point => point.id === segment.fromPointId);
  const toPoint = cloned.points.find(point => point.id === segment.toPointId);
  cloned.segments = cloned.segments.map(candidate => candidate.id === segmentId ? { ...candidate, type: 'LINE' as const } : candidate);
  if (fromPoint) fromPoint.outHandle = undefined;
  if (toPoint) toPoint.inHandle = undefined;
  return cloned;
}

function pathNeighbourPoint(geometry: PathGeometry, pointId: string, direction: 'IN'|'OUT'): PathPoint | undefined {
  const segment = geometry.segments.find(candidate => direction === 'IN' ? candidate.toPointId === pointId : candidate.fromPointId === pointId);
  if (!segment) return undefined;
  const neighbourId = direction === 'IN' ? segment.fromPointId : segment.toPointId;
  return geometry.points.find(point => point.id === neighbourId);
}

export function setPathPointMode(geometry: PathGeometry, pointIds: string[], mode: PathPoint['mode']): PathGeometry {
  const cloned = clonePathGeometry(geometry);
  const selected = new Set(pointIds);
  cloned.points = cloned.points.map(point => {
    if (!selected.has(point.id)) return point;
    if (mode === 'CORNER') return { ...point, mode };
    const incoming = pathNeighbourPoint(cloned, point.id, 'IN');
    const outgoing = pathNeighbourPoint(cloned, point.id, 'OUT');
    let inHandle = point.inHandle ? { ...point.inHandle } : undefined;
    let outHandle = point.outHandle ? { ...point.outHandle } : undefined;
    const fallbackDirection = outgoing
      ? { x: outgoing.x - point.x, y: outgoing.y - point.y }
      : incoming ? { x: point.x - incoming.x, y: point.y - incoming.y } : { x: 1, y: 0 };
    const fallbackLength = Math.max(0.5, Math.hypot(fallbackDirection.x, fallbackDirection.y) / 3);
    const unitLength = Math.hypot(fallbackDirection.x, fallbackDirection.y) || 1;
    const ux = fallbackDirection.x / unitLength, uy = fallbackDirection.y / unitLength;
    if (!inHandle && incoming) {
      const length = Math.max(0.5, Math.hypot(point.x-incoming.x, point.y-incoming.y)/3);
      inHandle = { x: point.x - ux*length, y: point.y - uy*length };
    }
    if (!outHandle && outgoing) {
      const length = Math.max(0.5, Math.hypot(outgoing.x-point.x, outgoing.y-point.y)/3);
      outHandle = { x: point.x + ux*length, y: point.y + uy*length };
    }
    if (!inHandle && !outHandle) {
      inHandle = { x: point.x - ux*fallbackLength, y: point.y - uy*fallbackLength };
      outHandle = { x: point.x + ux*fallbackLength, y: point.y + uy*fallbackLength };
    } else if (inHandle && !outHandle) {
      const dx = point.x - inHandle.x, dy = point.y - inHandle.y;
      outHandle = { x: point.x + dx, y: point.y + dy };
    } else if (outHandle && !inHandle) {
      const dx = point.x - outHandle.x, dy = point.y - outHandle.y;
      inHandle = { x: point.x + dx, y: point.y + dy };
    }
    if (inHandle && outHandle) {
      const inDx = point.x-inHandle.x, inDy = point.y-inHandle.y;
      const inLen = Math.hypot(inDx,inDy) || 1;
      const outLen = mode === 'SYMMETRIC' ? inLen : (Math.hypot(outHandle.x-point.x,outHandle.y-point.y) || inLen);
      outHandle = { x: point.x + inDx/inLen*outLen, y: point.y + inDy/inLen*outLen };
    }
    return { ...point, mode, inHandle, outHandle };
  });

  // Smooth/Symmetric nodes must be visually meaningful. A handle on a LINE
  // segment is ignored by the renderer, so promote every segment connected to
  // a selected smooth/symmetric node to cubic Bezier while preserving IDs and
  // topology. Corner mode intentionally does not force a segment-type change.
  if (mode === 'SMOOTH' || mode === 'SYMMETRIC') {
    cloned.segments = cloned.segments.map(segment =>
      (selected.has(segment.fromPointId) || selected.has(segment.toPointId)) && segment.type === 'LINE'
        ? { ...segment, type: 'CUBIC_BEZIER' as const }
        : segment
    );
  }
  return cloned;
}

export function deletePathPointsSafely(geometry: PathGeometry, pointIds: string[]): PathGeometry {
  const selected = new Set(pointIds);
  const remaining = geometry.points.filter(point => !selected.has(point.id));
  const minimum = geometry.closed ? 3 : 2;
  if (remaining.length < minimum) return clonePathGeometry(geometry);
  let next = clonePathGeometry(geometry);
  for (const id of pointIds) {
    if (!next.points.some(point => point.id === id)) continue;
    next = deletePathPoint(next, id);
  }
  if (next.points.length < minimum || !validatePathGeometry(next)) return clonePathGeometry(geometry);
  if (geometry.closed && next.points.length >= 3) next.closed = true;
  return next;
}

export function lineToCurve(geometry: PathGeometry, segmentId: string): PathGeometry {
  const cloned = clonePathGeometry(geometry);
  const segIndex = cloned.segments.findIndex(s => s.id === segmentId);
  if (segIndex === -1 || cloned.segments[segIndex].type !== 'LINE') return cloned;
  
  const seg = cloned.segments[segIndex];
  const p1 = cloned.points.find(p => p.id === seg.fromPointId);
  const p2 = cloned.points.find(p => p.id === seg.toPointId);
  if (!p1 || !p2) return cloned;
  
  // Reconstruct the discriminated union member instead of mutating a value narrowed to LINE.
  const converted: PathSegment = { ...seg, type: 'CUBIC_BEZIER' };
  cloned.segments[segIndex] = converted;
  p1.outHandle = { x: p1.x + (p2.x - p1.x) * 0.33, y: p1.y + (p2.y - p1.y) * 0.33 };
  p2.inHandle = { x: p1.x + (p2.x - p1.x) * 0.66, y: p1.y + (p2.y - p1.y) * 0.66 };
  
  return cloned;
}

export function lineToArc(geometry: PathGeometry, segmentId: string): PathGeometry {
  const cloned = clonePathGeometry(geometry);
  const segIndex = cloned.segments.findIndex(s => s.id === segmentId);
  if (segIndex === -1 || cloned.segments[segIndex].type !== 'LINE') return cloned;
  
  const seg = cloned.segments[segIndex];
  const p1 = cloned.points.find(p => p.id === seg.fromPointId);
  const p2 = cloned.points.find(p => p.id === seg.toPointId);
  if (!p1 || !p2) return cloned;
  
  const converted: PathSegment = { ...seg, type: 'CUBIC_BEZIER' };
  cloned.segments[segIndex] = converted;
  
  const kappa = 0.552284749831;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  
  // Simple cubic approximation for a semi-circle bulging 'up' relative to the line direction
  const nx = dy;
  const ny = -dx;
  
  p1.outHandle = {
    x: p1.x + dx * kappa + nx * kappa,
    y: p1.y + dy * kappa + ny * kappa
  };
  p2.inHandle = {
    x: p2.x - dx * kappa + nx * kappa,
    y: p2.y - dy * kappa + ny * kappa
  };
  
  return cloned;
}

export function flipArc(geometry: PathGeometry, segmentId: string): PathGeometry {
  const cloned = clonePathGeometry(geometry);
  const segIndex = cloned.segments.findIndex(s => s.id === segmentId);
  if (segIndex === -1 || cloned.segments[segIndex].type !== 'CUBIC_BEZIER') return cloned;
  
  const seg = cloned.segments[segIndex];
  const p1 = cloned.points.find(p => p.id === seg.fromPointId);
  const p2 = cloned.points.find(p => p.id === seg.toPointId);
  if (!p1 || !p2 || !p1.outHandle || !p2.inHandle) return cloned;
  
  // Flip handles across the line connecting p1 and p2
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx*dx + dy*dy;
  if (lenSq < 0.0001) return cloned;
  
  const flipPoint = (pt: {x:number, y:number}) => {
    // Project pt onto the line (p1, p2)
    const dot = ((pt.x - p1.x)*dx + (pt.y - p1.y)*dy) / lenSq;
    const projX = p1.x + dot * dx;
    const projY = p1.y + dot * dy;
    // Reflect
    return {
      x: pt.x + 2 * (projX - pt.x),
      y: pt.y + 2 * (projY - pt.y)
    };
  };
  
  p1.outHandle = flipPoint(p1.outHandle);
  p2.inHandle = flipPoint(p2.inHandle);
  
  return cloned;
}

export function scalePathGeometry(geometry: PathGeometry, scaleX: number, scaleY: number): PathGeometry {
  if (scaleX === 1 && scaleY === 1) return geometry;
  return {
    ...geometry,
    points: geometry.points.map(p => ({
      ...p,
      x: p.x * scaleX,
      y: p.y * scaleY,
      inHandle: p.inHandle ? { x: p.inHandle.x * scaleX, y: p.inHandle.y * scaleY } : undefined,
      outHandle: p.outHandle ? { x: p.outHandle.x * scaleX, y: p.outHandle.y * scaleY } : undefined
    }))
  };
}
