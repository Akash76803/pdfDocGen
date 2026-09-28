/**
 * UX-9.1: A deliberate one-click conversion, not an implicit change to all
 * existing Shape/media layouts. Existing text+media compositions are kept;
 * text-only/empty Shapes switch to image-only.
 */
export type ShapeImageFitFields = {
  shapeContentMode?: 'none' | 'text' | 'media' | 'text-media';
  shapeMediaPosition?: 'left' | 'right' | 'top' | 'bottom' | 'background' | 'center';
  shapeClipMedia?: boolean;
  shapePadding?: number;
  imageFit?: 'contain' | 'cover' | 'fill' | 'expand';
  imageObjectPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  imageZoomPercent?: number;
  shapeMediaOverlayOpacity?: number;
};
export function fitImageToShapePatch(
  selected: ShapeImageFitFields,
): ShapeImageFitFields {
  return {
    // Keep deliberately configured text overlays, not the default placeholder.
    shapeContentMode: selected.shapeContentMode === 'text-media' ? 'text-media' : 'media',
    shapeMediaPosition: 'background',
    shapeClipMedia: true,
    shapePadding: selected.shapeContentMode === 'text-media' ? selected.shapePadding : 0,
    imageFit: 'expand',
    imageObjectPosition: 'center',
    imageZoomPercent: 100,
    shapeMediaOverlayOpacity: 100,
  };
}

/**
 * Centered rectangular safe area strictly inside the selected clipping path.
 * object-fit:contain alone is insufficient for circles, stars and polygons:
 * their masks otherwise cut the corners of an otherwise complete picture.
 * Coordinates are relative percentages of the outer shape. The fit never
 * stretches the image; letterboxing is deliberate for mismatched ratios.
 */
export type ShapeSafeRect = { left: number; top: number; width: number; height: number };

type Point = { x: number; y: number };

function pointInsidePolygon(point: Point, vertices: Point[]): boolean {
  // Points on the boundary are inside; avoid false negatives on flat polygon edges.
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[j]!;
    const b = vertices[i]!;
    const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
    const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
    const lengthSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (Math.abs(cross) < 1e-7 && dot >= -1e-7 && dot <= lengthSq + 1e-7) return true;
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function isPointInsideShapeClip(clipPath: string, point: Point, width: number, height: number): boolean {
  if (!clipPath || clipPath === 'none') return true;
  if (clipPath.startsWith('polygon(')) {
    const vertices = [...clipPath.matchAll(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/g)]
      .map((match) => ({ x: Number(match[1]) / 100, y: Number(match[2]) / 100 }));
    return vertices.length >= 3 && pointInsidePolygon(point, vertices);
  }
  if (clipPath.startsWith('ellipse(')) {
    const match = clipPath.match(/ellipse\((\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
    if (!match) return true;
    const rx = Number(match[1]) / 100;
    const ry = Number(match[2]) / 100;
    return ((point.x - 0.5) / rx) ** 2 + ((point.y - 0.5) / ry) ** 2 <= 1 + 1e-8;
  }
  if (clipPath.startsWith('inset(')) {
    const match = clipPath.match(/round\s+(\d+(?:\.\d+)?)px/);
    if (!match) return true;
    // Rounded rectangle (or pill): normalize radius and account for CSS radius clamping.
    const radius = Math.min(Number(match[1]), width / 2, height / 2);
    if (radius <= 0) return true;
    const rx = radius / width, ry = radius / height;
    const nearestX = Math.min(1 - rx, Math.max(rx, point.x));
    const nearestY = Math.min(1 - ry, Math.max(ry, point.y));
    return ((point.x - nearestX) / rx) ** 2 + ((point.y - nearestY) / ry) ** 2 <= 1 + 1e-8;
  }
  return true;
}

export function shapeSafeMediaBounds(clipPath: string, width: number, height: number): ShapeSafeRect {
  if (!width || !height || width <= 0 || height <= 0 || !clipPath || clipPath === 'none')
    return { left: 0, top: 0, width: 100, height: 100 };

  // Binary-search the largest centered rectangle sharing the frame aspect
  // ratio. Check all edges (not only the corners): concave polygons can cut
  // through the center of a rectangular edge.
  const contained = (scale: number) => {
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const low = (1 - scale) / 2, high = (1 + scale) / 2;
      const v = low + (high - low) * t;
      if (!isPointInsideShapeClip(clipPath, { x: v, y: low }, width, height) ||
          !isPointInsideShapeClip(clipPath, { x: v, y: high }, width, height) ||
          !isPointInsideShapeClip(clipPath, { x: low, y: v }, width, height) ||
          !isPointInsideShapeClip(clipPath, { x: high, y: v }, width, height)) return false;
    }
    return true;
  };
  let lo = 0, hi = 1;
  for (let i = 0; i < 19; i++) {
    const mid = (lo + hi) / 2;
    if (contained(mid)) lo = mid;
    else hi = mid;
  }
  // Account for raster antialiasing along the edge.
  const safeScale = Math.max(0, lo - 0.003);
  const inset = ((1 - safeScale) / 2) * 100;
  return { left: inset, top: inset, width: safeScale * 100, height: safeScale * 100 };
}
