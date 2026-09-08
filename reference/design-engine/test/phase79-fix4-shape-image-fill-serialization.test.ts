import { describe, expect, it } from 'vitest';
import type { DesignTemplate, PathDesignElement, ShapeDesignElement } from '@document-tool/contracts';
import {
  deserializeDesignTemplate,
  serializeDesignTemplate,
  setFillImageSourceFieldBinding,
  validateDesignTemplate,
} from '../src/index.js';

function baseTemplate(element: ShapeDesignElement | PathDesignElement): DesignTemplate {
  return {
    kind: 'CARD_DESIGN',
    schemaVersion: 1,
    id: 'template-1',
    name: 'Shape binding serialization',
    version: 1,
    status: 'DRAFT',
    sharedAssets: [{
      id: 'manual-photo',
      name: 'Manual photo',
      kind: 'IMAGE',
      sourceType: 'DATA_URL',
      source: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlP8AAAAASUVORK5CYII=',
      mimeType: 'image/png',
      widthPx: 1,
      heightPx: 1,
    }],
    artboards: [{
      id: 'front',
      name: 'Front',
      order: 1,
      widthMm: 90,
      heightMm: 50,
      displayUnit: 'MM',
      background: { type: 'SOLID', color: '#ffffff' },
      print: {
        bleed: { topMm: 0, rightMm: 0, bottomMm: 0, leftMm: 0 },
        safeArea: { topMm: 0, rightMm: 0, bottomMm: 0, leftMm: 0 },
      },
      guides: [],
      groups: [],
      elements: [element],
    }],
  };
}

function shape(): ShapeDesignElement {
  return {
    id: 'shape-1', type: 'SHAPE', name: 'Photo frame', shape: 'CIRCLE',
    fill: { type: 'IMAGE', assetId: 'manual-photo', fit: 'FILL', opacity: 1 },
    stroke: { color: '#000000', widthMm: 0, style: 'NONE' },
    position: { xMm: 0, yMm: 0 }, size: { widthMm: 30, heightMm: 30 },
    rotationDeg: 0, opacity: 1, visible: true, locked: false, zIndex: 1,
  };
}

function path(): PathDesignElement {
  return {
    id: 'path-1', type: 'PATH', name: 'Custom photo frame',
    fill: { type: 'IMAGE', assetId: 'manual-photo', fit: 'FIT', opacity: 1 },
    stroke: { color: '#000000', widthMm: 0, style: 'NONE' },
    geometry: { points: [], segments: [], closed: true },
    position: { xMm: 0, yMm: 0 }, size: { widthMm: 30, heightMm: 30 },
    rotationDeg: 0, opacity: 1, visible: true, locked: false, zIndex: 1,
  };
}

describe('Phase 7.9 Fix4 shape image-fill binding serialization', () => {
  it.each([
    ['SHAPE', shape()],
    ['PATH', path()],
  ] as const)('%s accepts fillImageSource and survives serialize/reopen', (_type, element) => {
    const bound = setFillImageSourceFieldBinding(element, 'Photo');
    const template = baseTemplate(bound);
    const validation = validateDesignTemplate(template);
    expect(validation.valid).toBe(true);

    const serialized = serializeDesignTemplate(template);
    expect(serialized).toContain('fillImageSource');
    expect(serialized).toContain('Photo');

    const reopened = deserializeDesignTemplate(serialized);
    const savedElement = reopened.artboards[0].elements[0];
    expect(savedElement.bindings?.find(binding => binding.targetProperty === 'fillImageSource')?.fieldPath).toBe('Photo');
  });

  it('does not loosen unrelated element target-property validation', () => {
    const template = baseTemplate(shape());
    const invalidText = {
      id: 'text-1', type: 'TEXT', name: 'Text', text: 'x',
      style: { fontFamily: 'Arial', fontSizePt: 12, fontWeight: 400, italic: false, underline: false, color: '#000000', alignment: 'LEFT', lineHeight: 1.2, letterSpacingPt: 0 },
      position: { xMm: 0, yMm: 0 }, size: { widthMm: 20, heightMm: 10 },
      rotationDeg: 0, opacity: 1, visible: true, locked: false, zIndex: 2,
      bindings: [{ id: 'bad', targetProperty: 'fillImageSource', sourceType: 'FIELD', fieldPath: 'Photo' }],
    } as any;
    template.artboards[0].elements = [invalidText];
    const validation = validateDesignTemplate(template);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(error => error.message.includes("Unsupported target property 'fillImageSource' for element type TEXT"))).toBe(true);
  });
});
