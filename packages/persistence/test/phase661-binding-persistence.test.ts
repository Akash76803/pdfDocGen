import { describe, expect, it } from 'vitest';
import type { DesignTemplate, TextDesignElement } from '@document-tool/contracts';
import { deserializeDesignTemplate, serializeDesignTemplate } from '@document-tool/design-engine';

describe('Phase 6.6.1 binding persistence', () => {

  const baseTemplate: DesignTemplate = {
    kind: 'CARD_DESIGN', schemaVersion: 1, id: 't1', name: 'Test', version: 1, status: 'DRAFT', sharedAssets: [],
    artboards: [
      {
        id: 'a1', name: 'A1', order: 1, widthMm: 100, heightMm: 100, displayUnit: 'MM',
        background: { type: 'NONE' }, print: { bleed: {topMm:0,rightMm:0,bottomMm:0,leftMm:0}, safeArea: {topMm:0,rightMm:0,bottomMm:0,leftMm:0} },
        guides: [], groups: [],
        elements: [
          {
            id: 'e1', type: 'TEXT', name: 't', text: 'Static', visible: true,
            position: {xMm:0,yMm:0}, size: {widthMm:10,heightMm:10}, rotationDeg:0, opacity:1, locked:false, zIndex:0,
            style: { fontFamily:'Arial', fontSizePt:10, fontWeight:400, italic:false, underline:false, color:'#000', alignment:'LEFT', lineHeight:1.2, letterSpacingPt:0 },
            bindings: [
              {
                id: 'b1', targetProperty: 'text', sourceType: 'FIELD', fieldPath: 'Employee.Name',
                fallbackValue: 'Unknown', format: { type: 'TEXT' }, metadata: { meta: true }
              }
            ]
          } as TextDesignElement
        ]
      }
    ]
  };

  it('bindings array survives round trip unchanged', () => {
    const output = deserializeDesignTemplate(serializeDesignTemplate(baseTemplate));
    const bindings = (output.artboards[0].elements[0] as TextDesignElement).bindings;
    expect(bindings).toBeDefined();
    expect(bindings!.length).toBe(1);
    expect(bindings![0]).toEqual({
      id: 'b1', targetProperty: 'text', sourceType: 'FIELD', fieldPath: 'Employee.Name',
      fallbackValue: 'Unknown', format: { type: 'TEXT' }, metadata: { meta: true }
    });
  });

  it('old static template without bindings still round-trips', () => {
    const noBindings = JSON.parse(JSON.stringify(baseTemplate));
    delete noBindings.artboards[0].elements[0].bindings;
    const output = deserializeDesignTemplate(serializeDesignTemplate(noBindings));
    expect((output.artboards[0].elements[0] as any).bindings).toBeUndefined();
  });

});
