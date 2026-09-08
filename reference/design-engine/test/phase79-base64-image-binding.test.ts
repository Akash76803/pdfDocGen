import { describe, expect, it } from 'vitest';
import {
  MAX_DYNAMIC_IMAGE_BYTES,
  detectDynamicImageMimeType,
  normalizeDynamicImageSource,
  resolveArtboardBindings,
  resolveElementBindings,
  resolveRasterImageElementSource,
  setSourceFieldBinding,
} from '../src/index.js';
import type { Artboard, AssetReference, DesignDataContext, ImageDesignElement } from '@document-tool/contracts';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlP8AAAAASUVORK5CYII=';
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//9k=';
const MANUAL_SOURCE = `data:image/png;base64,${PNG_BASE64}`;
const DYNAMIC_JPEG = `data:image/jpeg;base64,${JPEG_BASE64}`;

function imageElement(fieldPath = 'photo'): ImageDesignElement {
  return setSourceFieldBinding({
    id: 'img-1', type: 'IMAGE', name: 'Photo', assetId: 'manual-asset', fit: 'FIT',
    position: { xMm: 0, yMm: 0 }, size: { widthMm: 20, heightMm: 20 },
    rotationDeg: 0, opacity: 1, visible: true, locked: false, zIndex: 1,
  }, fieldPath);
}

const assets: AssetReference[] = [{
  id: 'manual-asset', name: 'Manual fallback', kind: 'IMAGE', sourceType: 'DATA_URL',
  source: MANUAL_SOURCE, mimeType: 'image/png', widthPx: 1, heightPx: 1,
}];

function resolveSource(value: unknown): string | undefined {
  const resolved = resolveElementBindings(imageElement(), { record: { photo: value } }) as ImageDesignElement;
  return resolveRasterImageElementSource(resolved, assets);
}

describe('Dynamic Base64 image binding', () => {
  it('1. accepts a complete PNG Data URL unchanged', () => {
    const input = `data:image/png;base64,${PNG_BASE64}`;
    expect(normalizeDynamicImageSource(input, undefined)).toBe(input);
  });

  it('2. accepts a complete JPEG Data URL unchanged', () => {
    expect(normalizeDynamicImageSource(DYNAMIC_JPEG, undefined)).toBe(DYNAMIC_JPEG);
  });

  it('3. normalizes raw PNG Base64 into a Data URL', () => {
    expect(detectDynamicImageMimeType(PNG_BASE64)).toBe('image/png');
    expect(normalizeDynamicImageSource(`  ${PNG_BASE64}  `, undefined)).toBe(`data:image/png;base64,${PNG_BASE64}`);
  });

  it('4. normalizes raw JPEG Base64 into a Data URL', () => {
    expect(detectDynamicImageMimeType(JPEG_BASE64)).toBe('image/jpeg');
    expect(normalizeDynamicImageSource(JPEG_BASE64, undefined)).toBe(DYNAMIC_JPEG);
  });

  it('5. empty bound value uses the manual asset fallback', () => {
    expect(resolveSource('   ')).toBe(MANUAL_SOURCE);
    expect(resolveSource(null)).toBe(MANUAL_SOURCE);
  });

  it('6. invalid Base64 uses the manual asset fallback', () => {
    expect(resolveSource('%%% definitely-not-base64 %%%')).toBe(MANUAL_SOURCE);
  });

  it('7. record navigation changes the resolved image immediately', () => {
    const element = imageElement();
    const first = resolveElementBindings(element, { record: { photo: PNG_BASE64 } }) as ImageDesignElement;
    const second = resolveElementBindings(element, { record: { photo: JPEG_BASE64 } }) as ImageDesignElement;
    expect(resolveRasterImageElementSource(first, assets)).toBe(MANUAL_SOURCE);
    expect(resolveRasterImageElementSource(second, assets)).toBe(DYNAMIC_JPEG);
    expect(first).not.toBe(second);
    expect((element as ImageDesignElement & { source?: string }).source).toBeUndefined();
  });

  it('8. canvas/export shared source helper returns the same runtime source', () => {
    const resolved = resolveElementBindings(imageElement(), { record: { photo: JPEG_BASE64 } }) as ImageDesignElement;
    const canvasSource = resolveRasterImageElementSource(resolved, assets);
    const exportSource = resolveRasterImageElementSource(resolved, assets);
    expect(canvasSource).toBe(DYNAMIC_JPEG);
    expect(exportSource).toBe(canvasSource);
  });

  it('9. bulk-style record resolution resolves independent images without mutating rows', () => {
    const rows = [{ photo: PNG_BASE64 }, { photo: JPEG_BASE64 }, { photo: '' }];
    const snapshot = structuredClone(rows);
    const artboard: Artboard = {
      id: 'a1', name: 'Front', order: 0, widthMm: 90, heightMm: 50,
      background: { type: 'NONE' }, elements: [imageElement()], groups: [], guides: [],
    } as Artboard;
    const sources = rows.map(record => {
      const resolved = resolveArtboardBindings(artboard, { record });
      return resolveRasterImageElementSource(resolved.elements[0] as ImageDesignElement, assets);
    });
    expect(sources).toEqual([MANUAL_SOURCE, DYNAMIC_JPEG, MANUAL_SOURCE]);
    expect(rows).toEqual(snapshot);
    expect((artboard.elements[0] as ImageDesignElement & { source?: string }).source).toBeUndefined();
  });

  it('11. existing manual images remain unchanged when no binding exists', () => {
    const manual = imageElement();
    delete manual.bindings;
    const resolved = resolveElementBindings(manual, { record: { photo: JPEG_BASE64 } } as DesignDataContext);
    expect(resolved).toBe(manual);
    expect(resolveRasterImageElementSource(resolved as ImageDesignElement, assets)).toBe(MANUAL_SOURCE);
  });

  it('12. oversized payload is rejected safely without decoding it', () => {
    const oversized = 'A'.repeat(Math.ceil((MAX_DYNAMIC_IMAGE_BYTES + 1) * 4 / 3 / 4) * 4);
    expect(normalizeDynamicImageSource(oversized, MANUAL_SOURCE)).toBe(MANUAL_SOURCE);
  });

  it('rejects unsupported image Data URL MIME types for raster Image elements', () => {
    expect(normalizeDynamicImageSource('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', MANUAL_SOURCE)).toBe(MANUAL_SOURCE);
  });
});
