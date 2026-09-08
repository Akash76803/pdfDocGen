import type { PathDesignElement } from '@document-tool/contracts';

export interface PathRasterBounds {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly viewBoxX: number;
  readonly viewBoxY: number;
  readonly viewBoxWidthMm: number;
  readonly viewBoxHeightMm: number;
  readonly contentOffsetMm: number;
}

/**
 * Returns export-only visual bounds for a PATH.
 *
 * Open horizontal/vertical paths are intentionally stored with a tiny 0.001 mm
 * dimension. That is fine for geometry, but DOM/browser rasterizers can discard
 * an SVG whose containing box is effectively zero pixels wide/high. Expanding
 * the shell symmetrically by the stroke radius gives the rasterizer a real
 * paint box without changing the path geometry, persisted size, or rotation
 * center.
 */
export function resolvePathRasterBounds(pathElement: PathDesignElement): PathRasterBounds {
  const strokeActive = pathElement.stroke.style !== 'NONE' && pathElement.stroke.widthMm > 0;
  const strokePadMm = strokeActive ? Math.max(pathElement.stroke.widthMm / 2, 0.05) : 0;
  const widthMm = Math.max(pathElement.size.widthMm, 0.001);
  const heightMm = Math.max(pathElement.size.heightMm, 0.001);

  return {
    xMm: pathElement.position.xMm - strokePadMm,
    yMm: pathElement.position.yMm - strokePadMm,
    widthMm: widthMm + strokePadMm * 2,
    heightMm: heightMm + strokePadMm * 2,
    viewBoxX: -strokePadMm,
    viewBoxY: -strokePadMm,
    viewBoxWidthMm: widthMm + strokePadMm * 2,
    viewBoxHeightMm: heightMm + strokePadMm * 2,
    contentOffsetMm: strokePadMm,
  };
}
