import { describe, expect, it } from 'vitest';
import type { Artboard, DesignDataContext, TextDesignElement, SvgDesignElement, ImageDesignElement } from '@document-tool/contracts';
import { resolvePath, resolveDesignBinding, resolveElementBindings, resolveArtboardBindings } from '../src/bindings/index.js';

describe('Phase 6.6.1 dynamic binding architecture', () => {

  describe('resolvePath', () => {
    it('resolves simple fields', () => {
      expect(resolvePath({ Name: 'Akash' }, 'Name')).toBe('Akash');
    });
    it('resolves nested fields', () => {
      expect(resolvePath({ Employee: { Department: { Name: 'Operations' } } }, 'Employee.Department.Name')).toBe('Operations');
    });
    it('returns undefined for missing fields', () => {
      expect(resolvePath({ Employee: {} }, 'Employee.Department')).toBeUndefined();
    });
    it('handles null intermediate paths safely', () => {
      expect(resolvePath({ Employee: null }, 'Employee.Name')).toBeUndefined();
    });
    it('blocks __proto__', () => {
      const rec = JSON.parse('{"__proto__":{"polluted":"yes"}}');
      expect(resolvePath(rec, '__proto__.polluted')).toBeUndefined();
    });
    it('blocks constructor', () => {
      expect(resolvePath({}, 'constructor')).toBeUndefined();
    });
    it('blocks prototype', () => {
      expect(resolvePath({}, 'prototype')).toBeUndefined();
    });
    it('arrays are not implicitly traversed', () => {
      expect(resolvePath({ tags: ['a', 'b'] }, 'tags.0')).toBe('a');
    });
  });

  describe('resolveDesignBinding', () => {
    const ctx: DesignDataContext = {
      record: { Employee: { Name: 'Akash' }, IsActive: true, Age: 30 },
      calculated: { total: 100 }
    };

    it('resolves FIELD text', () => {
      const b = { id: '1', targetProperty: 'text', sourceType: 'FIELD' as const, fieldPath: 'Employee.Name' };
      expect(resolveDesignBinding(b, ctx)).toBe('Akash');
    });
    it('resolves FIELD nested value', () => {
      const b = { id: '1', targetProperty: 'text', sourceType: 'FIELD' as const, fieldPath: 'Age' };
      expect(resolveDesignBinding(b, ctx)).toBe(30);
    });
    it('resolves FIELD boolean', () => {
      const b = { id: '1', targetProperty: 'visible', sourceType: 'FIELD' as const, fieldPath: 'IsActive' };
      expect(resolveDesignBinding(b, ctx)).toBe(true);
    });
    it('falls back if missing', () => {
      const b = { id: '1', targetProperty: 'text', sourceType: 'FIELD' as const, fieldPath: 'Missing', fallbackValue: 'fallback' };
      expect(resolveDesignBinding(b, ctx)).toBe('fallback');
    });
    it('resolves CALCULATED', () => {
      const b = { id: '1', targetProperty: 'text', sourceType: 'CALCULATED' as const, calculatedFieldId: 'total' };
      expect(resolveDesignBinding(b, ctx)).toBe(100);
    });
    it('falls back for missing CALCULATED', () => {
      const b = { id: '1', targetProperty: 'text', sourceType: 'CALCULATED' as const, calculatedFieldId: 'missing', fallbackValue: 0 };
      expect(resolveDesignBinding(b, ctx)).toBe(0);
    });
    it('resolves STATIC', () => {
      const b = { id: '1', targetProperty: 'text', sourceType: 'STATIC' as const, fallbackValue: 'static-value' };
      expect(resolveDesignBinding(b, ctx)).toBe('static-value');
    });
  });

  describe('resolveElementBindings properties', () => {
    const ctx: DesignDataContext = { record: { IsActive: true, IsHidden: false, Avatar: 'http://img.com', SvgTint: '#ff0000', Name: 'Akash' } };
    
    it('maps text and visibility', () => {
      const el: TextDesignElement = {
        id: '1', type: 'TEXT', name: 't', text: 'original', visible: false,
        position: {xMm:0,yMm:0}, size: {widthMm:10,heightMm:10}, rotationDeg:0, opacity:1, locked:false, zIndex:0,
        style: { fontFamily:'Arial', fontSizePt:10, fontWeight:400, italic:false, underline:false, color:'#000', alignment:'LEFT', lineHeight:1.2, letterSpacingPt:0 },
        bindings: [
          { id: 'b1', targetProperty: 'text', sourceType: 'FIELD', fieldPath: 'Name' },
          { id: 'b2', targetProperty: 'visible', sourceType: 'FIELD', fieldPath: 'IsActive' }
        ]
      };
      const res = resolveElementBindings(el, ctx) as TextDesignElement;
      expect(res.text).toBe('Akash');
      expect(res.visible).toBe(true);
      // original unchanged
      expect(el.text).toBe('original');
      expect(el.visible).toBe(false);
    });

    it('maps IMAGE source', () => {
      const el: ImageDesignElement = {
        id: '1', type: 'IMAGE', name: 'img', assetId: 'orig', visible: true, fit: 'FIT',
        position: {xMm:0,yMm:0}, size: {widthMm:10,heightMm:10}, rotationDeg:0, opacity:1, locked:false, zIndex:0,
        bindings: [{ id: 'b1', targetProperty: 'source', sourceType: 'FIELD', fieldPath: 'Avatar' }]
      };
      const res = resolveElementBindings(el, ctx) as any;
      expect(res.source).toBe('http://img.com');
    });

    it('invalid visible non-boolean does not throw, just ignores', () => {
      const el: TextDesignElement = {
        id: '1', type: 'TEXT', name: 't', text: '', visible: true,
        position: {xMm:0,yMm:0}, size: {widthMm:10,heightMm:10}, rotationDeg:0, opacity:1, locked:false, zIndex:0,
        style: { fontFamily:'Arial', fontSizePt:10, fontWeight:400, italic:false, underline:false, color:'#000', alignment:'LEFT', lineHeight:1.2, letterSpacingPt:0 },
        bindings: [{ id: 'b2', targetProperty: 'visible', sourceType: 'FIELD', fieldPath: 'Name' }] // Name is string
      };
      const res = resolveElementBindings(el, ctx) as TextDesignElement;
      expect(res.visible).toBe(true); // unchanged
    });

    it('returns unchanged instance if no bindings', () => {
      const el: TextDesignElement = {
        id: '1', type: 'TEXT', name: 't', text: 'original', visible: false,
        position: {xMm:0,yMm:0}, size: {widthMm:10,heightMm:10}, rotationDeg:0, opacity:1, locked:false, zIndex:0,
        style: { fontFamily:'Arial', fontSizePt:10, fontWeight:400, italic:false, underline:false, color:'#000', alignment:'LEFT', lineHeight:1.2, letterSpacingPt:0 },
      };
      const res = resolveElementBindings(el, ctx);
      expect(res).toBe(el);
    });
  });

  describe('resolveArtboardBindings immutability', () => {
    it('returns a new artboard with resolved elements if bindings exist', () => {
      const el1: TextDesignElement = {
        id: '1', type: 'TEXT', name: 't', text: 'orig', visible: false,
        position: {xMm:0,yMm:0}, size: {widthMm:10,heightMm:10}, rotationDeg:0, opacity:1, locked:false, zIndex:0,
        style: { fontFamily:'Arial', fontSizePt:10, fontWeight:400, italic:false, underline:false, color:'#000', alignment:'LEFT', lineHeight:1.2, letterSpacingPt:0 },
        bindings: [{ id: 'b1', targetProperty: 'text', sourceType: 'FIELD', fieldPath: 'Name' }]
      };
      const art: Artboard = {
        id: 'a1', name: 'a1', order: 1, widthMm: 100, heightMm: 100, displayUnit: 'MM',
        background: { type: 'NONE' }, print: { bleed: {topMm:0,rightMm:0,bottomMm:0,leftMm:0}, safeArea: {topMm:0,rightMm:0,bottomMm:0,leftMm:0} },
        guides: [], groups: [], elements: [el1]
      };

      const res = resolveArtboardBindings(art, { record: { Name: 'Resolved!' } });
      expect(res).not.toBe(art);
      expect((res.elements[0] as TextDesignElement).text).toBe('Resolved!');
      expect(el1.text).toBe('orig');
    });

    it('returns original artboard instance if perfectly unchanged', () => {
      const el1: TextDesignElement = {
        id: '1', type: 'TEXT', name: 't', text: 'orig', visible: false,
        position: {xMm:0,yMm:0}, size: {widthMm:10,heightMm:10}, rotationDeg:0, opacity:1, locked:false, zIndex:0,
        style: { fontFamily:'Arial', fontSizePt:10, fontWeight:400, italic:false, underline:false, color:'#000', alignment:'LEFT', lineHeight:1.2, letterSpacingPt:0 },
      };
      const art: Artboard = {
        id: 'a1', name: 'a1', order: 1, widthMm: 100, heightMm: 100, displayUnit: 'MM',
        background: { type: 'NONE' }, print: { bleed: {topMm:0,rightMm:0,bottomMm:0,leftMm:0}, safeArea: {topMm:0,rightMm:0,bottomMm:0,leftMm:0} },
        guides: [], groups: [], elements: [el1]
      };

      const res = resolveArtboardBindings(art, { record: { Name: 'Resolved!' } });
      expect(res).toBe(art);
    });
  });

});
