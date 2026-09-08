import { describe, it, expect } from 'vitest';
import { resolveElementBindings } from '../src/bindings/resolver.js';
import { getSourceBinding, setSourceFieldBinding, removeSourceBinding } from '../src/bindings/editor.js';
import type { ImageDesignElement, SvgDesignElement, DesignDataContext } from '@document-tool/contracts';

describe('Phase 6.6.5 — Dynamic Image Binding', () => {
  const context: DesignDataContext = {
    record: {
      PhotoUrl: 'https://example.com/photo.jpg',
      LogoUrl: 'data:image/svg+xml;base64,PHN2Zy...',
      InvalidNumber: 123,
      InvalidObject: { src: 'x' },
      InvalidArray: ['a', 'b'],
      InvalidBoolean: true,
      EmptyString: '   ',
      MissingValue: null
    }
  };

  const createImageElement = (): ImageDesignElement => ({
    id: 'img-1',
    type: 'IMAGE',
    name: 'Photo',
    assetId: 'default-asset-123',
    fit: 'FIT',
    position: { xMm: 0, yMm: 0 },
    size: { widthMm: 10, heightMm: 10 },
    rotationDeg: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 1
  });

  const createSvgElement = (): SvgDesignElement => ({
    id: 'svg-1',
    type: 'SVG',
    name: 'Logo',
    assetId: 'default-svg-123',
    position: { xMm: 0, yMm: 0 },
    size: { widthMm: 10, heightMm: 10 },
    rotationDeg: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 1
  });

  describe('Binding Helpers', () => {
    it('creates source FIELD binding', () => {
      let el = createImageElement();
      el = setSourceFieldBinding(el, 'PhotoUrl', 'fallback-asset');
      
      const binding = getSourceBinding(el);
      expect(binding).toBeDefined();
      expect(binding?.targetProperty).toBe('source');
      expect(binding?.sourceType).toBe('FIELD');
      expect(binding?.fieldPath).toBe('PhotoUrl');
      expect(binding?.fallbackValue).toBe('fallback-asset');
    });

    it('updates existing source binding without replacing ID', () => {
      let el = createImageElement();
      el = setSourceFieldBinding(el, 'PhotoUrl');
      const firstId = getSourceBinding(el)?.id;

      el = setSourceFieldBinding(el, 'LogoUrl');
      const secondBinding = getSourceBinding(el);
      
      expect(secondBinding?.id).toBe(firstId);
      expect(secondBinding?.fieldPath).toBe('LogoUrl');
    });

    it('preserves unrelated bindings', () => {
      let el = createImageElement();
      el.bindings = [{ id: 'b1', targetProperty: 'visible', sourceType: 'FIELD', fieldPath: 'IsVisible' }];
      
      el = setSourceFieldBinding(el, 'PhotoUrl');
      expect(el.bindings?.length).toBe(2);
      expect(el.bindings?.find(b => b.targetProperty === 'visible')).toBeDefined();
    });

    it('removes source binding only', () => {
      let el = createImageElement();
      el.bindings = [{ id: 'b1', targetProperty: 'visible', sourceType: 'FIELD', fieldPath: 'IsVisible' }];
      el = setSourceFieldBinding(el, 'PhotoUrl');
      
      el = removeSourceBinding(el);
      expect(el.bindings?.length).toBe(1);
      expect(el.bindings?.[0].targetProperty).toBe('visible');
    });
  });

  describe('Resolution Behavior', () => {
    it('resolves IMAGE source from string field', () => {
      let el = createImageElement();
      el = setSourceFieldBinding(el, 'PhotoUrl', 'fallback-asset');
      
      const resolved = resolveElementBindings(el, context) as any;
      expect(resolved.source).toBe('https://example.com/photo.jpg');
      expect((el as any).source).toBeUndefined(); // Immutable source template
    });

    it('resolves SVG source from string field', () => {
      let el = createSvgElement();
      el = setSourceFieldBinding(el, 'LogoUrl', 'fallback-svg');
      
      const resolved = resolveElementBindings(el, context) as any;
      expect(resolved.source).toBe('data:image/svg+xml;base64,PHN2Zy...');
    });

    it('falls back to existing source property behavior if value is missing', () => {
      let el = createImageElement();
      el = setSourceFieldBinding(el, 'NonExistentField', 'fallback-asset');
      
      const resolved = resolveElementBindings(el, context) as any;
      expect(resolved.source).toBe('fallback-asset');
    });

    it('rejects null, number, boolean, array, object, empty string values and uses fallback', () => {
      let el = createImageElement();
      
      el = setSourceFieldBinding(el, 'InvalidNumber', 'fallback');
      expect((resolveElementBindings(el, context) as any).source).toBe('fallback');

      el = setSourceFieldBinding(el, 'InvalidObject', 'fallback');
      expect((resolveElementBindings(el, context) as any).source).toBe('fallback');

      el = setSourceFieldBinding(el, 'InvalidArray', 'fallback');
      expect((resolveElementBindings(el, context) as any).source).toBe('fallback');

      el = setSourceFieldBinding(el, 'InvalidBoolean', 'fallback');
      expect((resolveElementBindings(el, context) as any).source).toBe('fallback');

      el = setSourceFieldBinding(el, 'EmptyString', 'fallback');
      expect((resolveElementBindings(el, context) as any).source).toBe('fallback');

      el = setSourceFieldBinding(el, 'MissingValue', 'fallback');
      expect((resolveElementBindings(el, context) as any).source).toBe('fallback');
    });

    it('returns undefined if value is invalid and no valid fallback exists', () => {
      let el = createImageElement();
      el = setSourceFieldBinding(el, 'InvalidNumber'); // No fallback
      expect((resolveElementBindings(el, context) as any).source).toBeUndefined();
      
      el = setSourceFieldBinding(el, 'InvalidNumber', '   '); // Empty fallback
      expect((resolveElementBindings(el, context) as any).source).toBeUndefined();
    });

    it('blocks prototype pollution', () => {
      let el = createImageElement();
      el = setSourceFieldBinding(el, '__proto__.polluted', 'fallback');
      
      const resolved = resolveElementBindings(el, context) as any;
      expect(resolved.source).toBe('fallback');
    });

    it('does not alter element geometry or assetId', () => {
      let el = createImageElement();
      el = setSourceFieldBinding(el, 'PhotoUrl');
      
      const resolved = resolveElementBindings(el, context) as ImageDesignElement;
      expect(resolved.size.widthMm).toBe(10);
      expect(resolved.assetId).toBe('default-asset-123'); // Original reference remains intact
    });
  });
});
