import { describe, it, expect } from 'vitest';
import { 
  getValueBinding, 
  setValueFieldBinding, 
  removeValueBinding, 
  normalizeDynamicCodeValue,
  resolveElementBindings 
} from '../src/bindings/index.js';
import type { QrDesignElement, BarcodeDesignElement, DesignDataContext } from '@document-tool/contracts';

describe('Phase 6.6.6 QR and Barcode Binding', () => {
  describe('Binding Helpers', () => {
    const dummyQr: QrDesignElement = {
      id: 'qr-1',
      type: 'QR',
      name: 'My QR',
      visible: true,
      locked: false,
      opacity: 1,
      position: { xMm: 0, yMm: 0 },
      size: { widthMm: 10, heightMm: 10 },
      rotationDeg: 0,
      value: 'https://example.com',
      foreground: '#000000',
      background: '#ffffff',
      errorCorrection: 'M'
    };

    it('creates a value binding preserving fallback', () => {
      const bound = setValueFieldBinding(dummyQr, 'UrlField');
      const binding = getValueBinding(bound);
      expect(binding).toBeDefined();
      expect(binding?.targetProperty).toBe('value');
      expect(binding?.sourceType).toBe('FIELD');
      expect(binding?.fieldPath).toBe('UrlField');
      expect(binding?.fallbackValue).toBe('https://example.com');
    });

    it('updates binding without changing ID', () => {
      const bound1 = setValueFieldBinding(dummyQr, 'UrlField');
      const id1 = getValueBinding(bound1)?.id;
      const bound2 = setValueFieldBinding(bound1, 'NewField');
      const id2 = getValueBinding(bound2)?.id;
      
      expect(id1).toBe(id2);
      expect(getValueBinding(bound2)?.fieldPath).toBe('NewField');
    });

    it('preserves unrelated bindings', () => {
      const withOther = { ...dummyQr, bindings: [{ id: 'other', targetProperty: 'visible' as const, sourceType: 'STATIC' as const }] };
      const bound = setValueFieldBinding(withOther as any, 'UrlField');
      expect(bound.bindings?.length).toBe(2);
      expect(bound.bindings?.find(b => b.id === 'other')).toBeDefined();
    });

    it('removes only value binding', () => {
      const bound = setValueFieldBinding(dummyQr, 'UrlField');
      const unbound = removeValueBinding(bound);
      expect(getValueBinding(unbound)).toBeUndefined();
      expect(unbound.bindings).toBeUndefined(); // or empty
    });
  });

  describe('Value Normalization', () => {
    it('normalizes valid strings', () => {
      expect(normalizeDynamicCodeValue('valid', 'fall')).toBe('valid');
    });
    it('normalizes finite numbers to strings', () => {
      expect(normalizeDynamicCodeValue(123.45, 'fall')).toBe('123.45');
    });
    it('normalizes booleans to strings', () => {
      expect(normalizeDynamicCodeValue(true, 'fall')).toBe('true');
      expect(normalizeDynamicCodeValue(false, 'fall')).toBe('false');
    });
    it('falls back on invalid types', () => {
      expect(normalizeDynamicCodeValue(null, 'fall')).toBe('fall');
      expect(normalizeDynamicCodeValue(undefined, 'fall')).toBe('fall');
      expect(normalizeDynamicCodeValue({}, 'fall')).toBe('fall');
      expect(normalizeDynamicCodeValue([], 'fall')).toBe('fall');
    });
    it('falls back on empty strings', () => {
      expect(normalizeDynamicCodeValue('', 'fall')).toBe('fall');
      expect(normalizeDynamicCodeValue('   ', 'fall')).toBe('fall');
    });
  });

  describe('QR Resolution Behavior', () => {
    const dummyQr: QrDesignElement = {
      id: 'qr-1',
      type: 'QR',
      name: 'QR',
      visible: true,
      locked: false,
      opacity: 1,
      position: { xMm: 0, yMm: 0 },
      size: { widthMm: 10, heightMm: 10 },
      rotationDeg: 0,
      value: 'original-value',
      foreground: '#000000',
      background: '#ffffff',
      errorCorrection: 'L',
      bindings: [
        {
          id: 'b1',
          targetProperty: 'value',
          sourceType: 'FIELD',
          fieldPath: 'dynamic',
          fallbackValue: 'fallback-value'
        }
      ]
    };

    it('resolves string from context', () => {
      const ctx: DesignDataContext = { record: { dynamic: 'resolved-string' } };
      const resolved = resolveElementBindings(dummyQr, ctx) as QrDesignElement;
      expect(resolved.value).toBe('resolved-string');
    });

    it('resolves number from context', () => {
      const ctx: DesignDataContext = { record: { dynamic: 999 } };
      const resolved = resolveElementBindings(dummyQr, ctx) as QrDesignElement;
      expect(resolved.value).toBe('999');
    });

    it('uses fallback on missing field', () => {
      const ctx: DesignDataContext = { record: {} };
      const resolved = resolveElementBindings(dummyQr, ctx) as QrDesignElement;
      expect(resolved.value).toBe('fallback-value');
    });

    it('leaves source unchanged', () => {
      const ctx: DesignDataContext = { record: { dynamic: 'new' } };
      resolveElementBindings(dummyQr, ctx);
      expect(dummyQr.value).toBe('original-value');
    });
    
    it('returns same element if unbound', () => {
       const unbound = removeValueBinding(dummyQr);
       const ctx: DesignDataContext = { record: { dynamic: 'new' } };
       const resolved = resolveElementBindings(unbound, ctx);
       expect(resolved).toBe(unbound);
    });
  });

  describe('Barcode Resolution Behavior', () => {
    const dummyBarcode: BarcodeDesignElement = {
      id: 'bc-1',
      type: 'BARCODE',
      name: 'Barcode',
      visible: true,
      locked: false,
      opacity: 1,
      position: { xMm: 0, yMm: 0 },
      size: { widthMm: 30, heightMm: 10 },
      rotationDeg: 0,
      value: '123456',
      symbology: 'CODE128',
      foreground: '#000',
      background: '#fff',
      bindings: [
        {
          id: 'b2',
          targetProperty: 'value',
          sourceType: 'FIELD',
          fieldPath: 'code',
          fallbackValue: '999999'
        }
      ]
    };

    it('resolves string from context', () => {
      const ctx: DesignDataContext = { record: { code: 'ABC-DEF' } };
      const resolved = resolveElementBindings(dummyBarcode, ctx) as BarcodeDesignElement;
      expect(resolved.value).toBe('ABC-DEF');
    });

    it('uses fallback on dangerous field', () => {
      const badBinding = { ...dummyBarcode, bindings: [{ ...dummyBarcode.bindings![0], fieldPath: '__proto__' }] };
      const ctx: DesignDataContext = { record: { '__proto__': 'bad' } };
      const resolved = resolveElementBindings(badBinding, ctx) as BarcodeDesignElement;
      expect(resolved.value).toBe('999999');
    });
  });
});
