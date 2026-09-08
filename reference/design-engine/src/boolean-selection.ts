import type { DesignElement, PathDesignElement, ShapeDesignElement } from '@document-tool/contracts';
import { shapeToPathGeometry } from './pathUtils.js';
import { getElementCapabilities, canBooleanSelection } from './capabilities.js';
import { performElementBooleanOperation, performElementFragmentOperation } from './booleanUtils.js';

export type BooleanOperation = 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE';

export function toBooleanPathElement(element: DesignElement): PathDesignElement | null {
  if (!getElementCapabilities(element).boolean || element.locked || !element.visible) return null;
  if (element.type === 'PATH') return element;
  if (element.type !== 'SHAPE') return null;
  const shape = element as ShapeDesignElement;
  return {
    ...shape,
    type: 'PATH',
    geometry: shapeToPathGeometry(shape.shape, shape.size),
    fill: shape.fill,
    stroke: shape.stroke,
    shadow: shape.shadow,
    label: shape.label,
  } as PathDesignElement;
}

export function orderBooleanSelection(elements: readonly DesignElement[], primaryElementId?: string): PathDesignElement[] {
  const paths = elements.map(toBooleanPathElement).filter((value): value is PathDesignElement => Boolean(value));
  if (paths.length < 2) return paths;
  const primaryIndex = primaryElementId ? paths.findIndex(path => path.id === primaryElementId) : -1;
  if (primaryIndex <= 0) return paths;
  const [primary] = paths.splice(primaryIndex, 1);
  return [primary!, ...paths];
}

export function performBooleanSelection(
  elements: readonly DesignElement[],
  primaryElementId: string | undefined,
  operation: BooleanOperation,
): PathDesignElement | null {
  const paths = orderBooleanSelection(elements, primaryElementId);
  if (paths.length < 2) return null;
  let result = paths[0]!;
  if (operation === 'SUBTRACT') {
    for (const cutter of paths.slice(1)) {
      result = performElementBooleanOperation(result, cutter, 'SUBTRACT');
      if (!result.geometry.points.length || result.size.widthMm <= 1e-9 || result.size.heightMm <= 1e-9) return null;
    }
    return result;
  }
  for (const operand of paths.slice(1)) {
    result = performElementBooleanOperation(result, operand, operation);
    if (operation === 'INTERSECT' && (!result.geometry.points.length || result.size.widthMm <= 1e-9 || result.size.heightMm <= 1e-9)) return null;
  }
  return result.geometry.points.length && result.size.widthMm > 1e-9 && result.size.heightMm > 1e-9 ? result : null;
}

export function canFragmentSelection(elements: readonly DesignElement[]): boolean {
  return elements.length === 2 && canBooleanSelection(elements);
}

export function performFragmentSelection(
  elements: readonly DesignElement[],
  primaryElementId?: string,
): PathDesignElement[] {
  const paths = orderBooleanSelection(elements, primaryElementId);
  if (paths.length !== 2) return [];
  return performElementFragmentOperation(paths[0]!, paths[1]!);
}
