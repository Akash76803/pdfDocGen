export type DesignerToolbarMode = 'NONE' | 'ARTBOARD' | 'TEXT' | 'IMAGE' | 'SVG' | 'SHAPE' | 'PATH' | 'MULTI';

export function getDesignerToolbarMode(elementTypes: string[], selectionCount: number): DesignerToolbarMode {
  if (selectionCount === 0) {
    return 'ARTBOARD';
  }
  
  if (selectionCount > 1) {
    return 'MULTI';
  }
  
  const type = elementTypes[0];
  switch (type) {
    case 'TEXT': return 'TEXT';
    case 'IMAGE': return 'IMAGE';
    case 'SVG': return 'SVG';
    case 'SHAPE': return 'SHAPE';
    case 'PATH': return 'PATH';
    default: return 'NONE';
  }
}
