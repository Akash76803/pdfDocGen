import type { DesignElement, DesignFill, DesignStroke, DesignTemplate } from '@document-tool/contracts';
import { repairArtboardGroupIntegrity } from './group-integrity.js';
import {
  DEFAULT_DESIGN_STROKE,
  DEFAULT_SHAPE_FILL,
  normalizeImageFillTransform,
  normalizeLinearGradient,
  normalizePatternFill,
  normalizeRadialGradient,
  normalizeStyleOpacity,
} from './styling.js';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const finiteNonNegative = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function normalizeDesignFill(fill: DesignFill | undefined, fallback: DesignFill = DEFAULT_SHAPE_FILL): DesignFill {
  if (!fill || typeof fill !== 'object') return clone(fallback);
  switch (fill.type) {
    case 'NONE': return { type: 'NONE' };
    case 'SOLID': return { type: 'SOLID', color: fill.color || '#000000', ...(fill.opacity === undefined ? {} : { opacity: normalizeStyleOpacity(fill.opacity) }) };
    case 'LINEAR_GRADIENT': return { type: 'LINEAR_GRADIENT', gradient: normalizeLinearGradient(fill.gradient) };
    case 'RADIAL_GRADIENT': return { type: 'RADIAL_GRADIENT', gradient: normalizeRadialGradient(fill.gradient) };
    case 'PATTERN': return { type: 'PATTERN', pattern: normalizePatternFill(fill.pattern) };
    case 'IMAGE': return {
      type: 'IMAGE',
      assetId: fill.assetId,
      fit: fill.fit === 'FILL' || fill.fit === 'STRETCH' ? fill.fit : 'FIT',
      ...(fill.opacity === undefined ? {} : { opacity: normalizeStyleOpacity(fill.opacity) }),
      ...(fill.transform === undefined ? {} : { transform: normalizeImageFillTransform(fill.transform) }),
      ...(('source' in fill && typeof (fill as { source?: unknown }).source === 'string') ? { source: (fill as { source: string }).source } : {}),
    } as DesignFill;
    default: return clone(fallback);
  }
}

export function normalizeDesignStroke(stroke: DesignStroke | undefined, fallback: DesignStroke = DEFAULT_DESIGN_STROKE): DesignStroke {
  if (!stroke || typeof stroke !== 'object') return clone(fallback);
  const style = stroke.style === 'SOLID' || stroke.style === 'DASHED' || stroke.style === 'DOTTED' || stroke.style === 'CUSTOM' || stroke.style === 'NONE' ? stroke.style : fallback.style;
  const lineCap = stroke.lineCap === 'ROUND' || stroke.lineCap === 'SQUARE' || stroke.lineCap === 'BUTT' ? stroke.lineCap : (fallback.lineCap ?? 'BUTT');
  const lineJoin = stroke.lineJoin === 'ROUND' || stroke.lineJoin === 'BEVEL' || stroke.lineJoin === 'MITER' ? stroke.lineJoin : (fallback.lineJoin ?? 'MITER');
  const dashArray = Array.isArray(stroke.dashArray) ? stroke.dashArray.filter(value => Number.isFinite(value) && value > 0) : undefined;
  return {
    color: stroke.color || fallback.color,
    widthMm: finiteNonNegative(stroke.widthMm, fallback.widthMm),
    style,
    ...(stroke.opacity === undefined ? {} : { opacity: normalizeStyleOpacity(stroke.opacity) }),
    lineCap,
    lineJoin,
    miterLimit: Math.max(1, finite(stroke.miterLimit, fallback.miterLimit ?? 4)),
    ...(dashArray?.length ? { dashArray } : {}),
    dashOffset: finite(stroke.dashOffset, fallback.dashOffset ?? 0),
  };
}

export function normalizeDesignElement(element: DesignElement): DesignElement {
  const base = {
    ...element,
    opacity: normalizeStyleOpacity(element.opacity),
    rotationDeg: Number.isFinite(element.rotationDeg) ? element.rotationDeg : 0,
  } as DesignElement;
  switch (base.type) {
    case 'SHAPE': return { ...base, fill: normalizeDesignFill(base.fill), stroke: normalizeDesignStroke(base.stroke) };
    case 'PATH': return { ...base, fill: normalizeDesignFill(base.fill), stroke: normalizeDesignStroke(base.stroke) };
    case 'IMAGE': return base.stroke ? { ...base, stroke: normalizeDesignStroke(base.stroke) } : base;
    case 'SVG': return base.stroke ? { ...base, stroke: normalizeDesignStroke(base.stroke) } : base;
    default: return base;
  }
}

export function normalizeDesignTemplate(template: DesignTemplate): DesignTemplate {
  return {
    ...template,
    artboards: template.artboards.map(artboard => repairArtboardGroupIntegrity({
      ...artboard,
      background: normalizeDesignFill(artboard.background, { type: 'SOLID', color: '#ffffff', opacity: 1 }),
      elements: artboard.elements.map(normalizeDesignElement),
    })),
  };
}
