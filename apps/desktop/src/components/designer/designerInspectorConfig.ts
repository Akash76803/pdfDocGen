import type { DesignElement } from '@document-tool/contracts';
import { InspectorSectionKey } from './DesignerInspectorRail.tsx';

export function getInspectorSections(elementType?: DesignElement['type']): InspectorSectionKey[] {
  if (!elementType) {
    return ['GENERAL'];
  }

  switch (elementType) {
    case 'TEXT':
      return ['GENERAL', 'TRANSFORM', 'TYPOGRAPHY', 'APPEARANCE', 'DATA_BINDING', 'ADVANCED'];
    case 'IMAGE':
    case 'SVG':
      return ['GENERAL', 'TRANSFORM', 'APPEARANCE', 'DATA_BINDING', 'ADVANCED'];
    case 'QR':
    case 'BARCODE':
      return ['GENERAL', 'TRANSFORM', 'APPEARANCE', 'DATA_BINDING', 'ADVANCED'];
    case 'SHAPE':
    case 'PATH':
      return ['GENERAL', 'TRANSFORM', 'APPEARANCE', 'ADVANCED'];
    default:
      return ['GENERAL', 'TRANSFORM', 'APPEARANCE', 'ADVANCED'];
  }
}
