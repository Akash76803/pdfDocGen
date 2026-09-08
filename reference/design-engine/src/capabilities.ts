import type { DesignElement, PathDesignElement, ShapeDesignElement } from '@document-tool/contracts';

export interface ElementCapabilities {
  transform: boolean;
  fill: boolean;
  stroke: boolean;
  geometryEdit: boolean;
  boolean: boolean;
  text: boolean;
  imageFill: boolean;
  grouping: boolean;
}

const OPEN_SHAPE_KINDS = new Set<ShapeDesignElement['shape']>(['LINE', 'FLEXIBLE_LINE', 'ARC', 'BRACKET']);

export function isClosedVectorElement(element: DesignElement): boolean {
  if (element.type === 'SHAPE') return !OPEN_SHAPE_KINDS.has(element.shape);
  if (element.type !== 'PATH') return false;
  if (element.geometry.closed) return true;
  const subpaths = element.geometry.subpaths;
  return !!subpaths?.length && subpaths.every(subpath => subpath.closed);
}

export function getElementCapabilities(element: DesignElement): ElementCapabilities {
  const closedVector = isClosedVectorElement(element);
  switch (element.type) {
    case 'SHAPE':
      return {
        transform: true,
        fill: closedVector,
        stroke: true,
        geometryEdit: false,
        boolean: closedVector,
        text: closedVector,
        imageFill: closedVector,
        grouping: true,
      };
    case 'PATH':
      return {
        transform: true,
        fill: closedVector,
        stroke: true,
        geometryEdit: true,
        boolean: closedVector,
        text: closedVector,
        imageFill: closedVector,
        grouping: true,
      };
    case 'TEXT':
      return { transform: true, fill: false, stroke: false, geometryEdit: false, boolean: false, text: true, imageFill: false, grouping: true };
    case 'IMAGE':
      return { transform: true, fill: false, stroke: true, geometryEdit: false, boolean: false, text: false, imageFill: true, grouping: true };
    case 'SVG':
      return { transform: true, fill: false, stroke: true, geometryEdit: false, boolean: false, text: false, imageFill: false, grouping: true };
    case 'QR':
    case 'BARCODE':
      return { transform: true, fill: false, stroke: false, geometryEdit: false, boolean: false, text: false, imageFill: false, grouping: true };
    case 'CUSTOM':
      return { transform: true, fill: false, stroke: false, geometryEdit: false, boolean: false, text: false, imageFill: false, grouping: true };
  }
}

export function canBooleanSelection(elements: readonly DesignElement[]): boolean {
  return elements.length >= 2 && elements.every(element => getElementCapabilities(element).boolean && !element.locked && element.visible);
}

export function isEditablePath(element: DesignElement): element is PathDesignElement {
  return element.type === 'PATH' && getElementCapabilities(element).geometryEdit;
}
