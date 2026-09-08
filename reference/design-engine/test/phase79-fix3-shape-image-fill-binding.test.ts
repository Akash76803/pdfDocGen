import { describe, expect, it } from 'vitest';
import type { AssetReference, ShapeDesignElement, PathDesignElement } from '@document-tool/contracts';
import {
  getFillImageSourceBinding,
  removeFillImageSourceBinding,
  resolveElementBindings,
  resolveRasterImageFillSource,
  setFillImageSourceFieldBinding,
} from '../src/index.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlP8AAAAASUVORK5CYII=';
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//9k=';
const MANUAL_SOURCE = `data:image/png;base64,${PNG_BASE64}`;
const JPEG_SOURCE = `data:image/jpeg;base64,${JPEG_BASE64}`;

const assets: AssetReference[] = [{
  id: 'manual-photo', name: 'Manual photo', kind: 'IMAGE', sourceType: 'DATA_URL',
  source: MANUAL_SOURCE, mimeType: 'image/png', widthPx: 1, heightPx: 1,
}];

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

describe('Shape image fill dynamic field binding', () => {
  it('stores only binding metadata and preserves the manual asset fallback', () => {
    const bound = setFillImageSourceFieldBinding(shape(), 'Photo');
    const binding = getFillImageSourceBinding(bound);
    expect(binding?.targetProperty).toBe('fillImageSource');
    expect(binding?.fieldPath).toBe('Photo');
    expect(binding?.fallbackValue).toBeUndefined();
    expect(bound.fill).toEqual({ type: 'IMAGE', assetId: 'manual-photo', fit: 'FILL', opacity: 1 });
    expect(JSON.stringify(bound)).not.toContain(JPEG_BASE64);
  });

  it('resolves raw Base64 per record and canvas/export helper prefers runtime source', () => {
    const authored = setFillImageSourceFieldBinding(shape(), 'Photo');
    const resolved = resolveElementBindings(authored, { record: { Photo: JPEG_BASE64 } }) as ShapeDesignElement;
    expect(resolveRasterImageFillSource(resolved.fill as Extract<ShapeDesignElement['fill'], {type:'IMAGE'}>, assets)).toBe(JPEG_SOURCE);
    expect(resolveRasterImageFillSource(resolved.fill as Extract<ShapeDesignElement['fill'], {type:'IMAGE'}>, assets))
      .toBe(resolveRasterImageFillSource(resolved.fill as Extract<ShapeDesignElement['fill'], {type:'IMAGE'}>, assets));
    expect((authored.fill as typeof authored.fill & {source?: string}).source).toBeUndefined();
  });

  it('falls back to the manually selected asset for empty or invalid values', () => {
    const authored = setFillImageSourceFieldBinding(shape(), 'Photo');
    for (const Photo of ['', null, 'not-valid-base64']) {
      const resolved = resolveElementBindings(authored, { record: { Photo } }) as ShapeDesignElement;
      expect(resolveRasterImageFillSource(resolved.fill as Extract<ShapeDesignElement['fill'], {type:'IMAGE'}>, assets)).toBe(MANUAL_SOURCE);
    }
  });

  it('record navigation resolves independent shape fill images without mutating authored state', () => {
    const authored = setFillImageSourceFieldBinding(shape(), 'Photo');
    const first = resolveElementBindings(authored, { record: { Photo: JPEG_BASE64 } }) as ShapeDesignElement;
    const second = resolveElementBindings(authored, { record: { Photo: '' } }) as ShapeDesignElement;
    expect(resolveRasterImageFillSource(first.fill as Extract<ShapeDesignElement['fill'], {type:'IMAGE'}>, assets)).toBe(JPEG_SOURCE);
    expect(resolveRasterImageFillSource(second.fill as Extract<ShapeDesignElement['fill'], {type:'IMAGE'}>, assets)).toBe(MANUAL_SOURCE);
    expect((authored.fill as typeof authored.fill & {source?: string}).source).toBeUndefined();
  });

  it('works for PATH image fills through the same binding architecture', () => {
    const authored = setFillImageSourceFieldBinding(path(), 'Photo');
    const resolved = resolveElementBindings(authored, { record: { Photo: JPEG_BASE64 } }) as PathDesignElement;
    expect(resolveRasterImageFillSource(resolved.fill as Extract<PathDesignElement['fill'], {type:'IMAGE'}>, assets)).toBe(JPEG_SOURCE);
  });

  it('removing the binding preserves the manual image fill', () => {
    const bound = setFillImageSourceFieldBinding(shape(), 'Photo');
    const unbound = removeFillImageSourceBinding(bound);
    expect(getFillImageSourceBinding(unbound)).toBeUndefined();
    expect(resolveRasterImageFillSource(unbound.fill as Extract<ShapeDesignElement['fill'], {type:'IMAGE'}>, assets)).toBe(MANUAL_SOURCE);
  });
});
