/**
 * Phase 6.6.9 — Dynamic Binding Freeze Test
 * 
 * Validates the complete source/resolved invariant:
 * - Source template is never mutated
 * - Resolved clone has correct runtime values
 * - runtimeHidden never leaks back to source
 * - All binding types switch correctly per record
 */
import { describe, it, expect } from 'vitest';
import { resolveArtboardBindings, createQrElement, createBarcodeElement, createTextElement, createShapeElement } from '../src';
import { addDesignElement, createBlankArtboard } from '../src';
import type { Artboard, DesignDataContext, TextDesignElement, QrDesignElement, BarcodeDesignElement, ElementVisibilityRule } from '@document-tool/contracts';

function makeArtboard(): Artboard {
  return createBlankArtboard({ id: 'test-ab', name: 'Test', order: 0, widthMm: 90, heightMm: 50 });
}

const RECORD_A: Record<string, unknown> = {
  Name: 'Alice',
  PhotoUrl: 'https://cdn.example.com/alice.jpg',
  QrValue: 'https://qr.example.com/alice',
  BarcodeValue: 'BAR-ALICE-001',
  Status: 'Approved',
};

const RECORD_B: Record<string, unknown> = {
  Name: 'Bob',
  PhotoUrl: 'https://cdn.example.com/bob.jpg',
  QrValue: 'https://qr.example.com/bob',
  BarcodeValue: 'BAR-BOB-002',
  Status: 'Draft',
};

const ctxA: DesignDataContext = { record: RECORD_A };
const ctxB: DesignDataContext = { record: RECORD_B };

describe('Phase 6.6.9 – Dynamic Binding Freeze', () => {

  describe('source template immutability', () => {
    it('resolving with record A does not mutate the source artboard', () => {
      const artboard = makeArtboard();
      const textEl = createTextElement({ id: 'text-1', name: 'Name', xMm:5, yMm:5, zIndex:1 });
      const withText = addDesignElement({ kind:'CARD_DESIGN', schemaVersion:1, id:'t1', name:'Test', version:1, status:'DRAFT', artboards:[artboard], sharedAssets:[] }, 'test-ab', { ...textEl, bindings: [{ id:'b1', type:'TEXT_FIELD', fieldPath:'Name', targetProperty:'text' }] } as any);
      const source = withText.artboards.find(a => a.id === 'test-ab')!;
      const sourceElementsBefore = JSON.stringify(source.elements);
      
      resolveArtboardBindings(source, ctxA);
      
      const sourceElementsAfter = JSON.stringify(source.elements);
      expect(sourceElementsAfter).toBe(sourceElementsBefore);
    });

    it('source elements have no runtimeHidden after resolution', () => {
      const artboard = makeArtboard();
      const visRule: ElementVisibilityRule = { id: 'vr1', enabled: true, fieldPath: 'Status', operator: 'EQUALS', value: 'Approved' };
      const shapeEl = { ...createShapeElement('RECTANGLE', { id: 'shape-1', xMm:0, yMm:0, zIndex:1 }), visibilityRule: visRule };
      const with_shape = addDesignElement({ kind:'CARD_DESIGN', schemaVersion:1, id:'t2', name:'T', version:1, status:'DRAFT', artboards:[artboard], sharedAssets:[] }, 'test-ab', shapeEl as any);
      const source = with_shape.artboards[0]!;
      
      resolveArtboardBindings(source, ctxB); // Status=Draft → should be hidden
      
      // Source element MUST NOT have runtimeHidden set
      const sourceEl = source.elements[0]!;
      expect(sourceEl.runtimeHidden).toBeUndefined();
    });
  });

  describe('record A vs record B — all binding types switch', () => {
    it('text binding resolves to correct name per record', () => {
      const artboard = makeArtboard();
      const textEl = { ...createTextElement({ id:'t1', name:'N', xMm:0, yMm:0, zIndex:1 }), text:'Hello {{Name}}', textBindingMode: 'TEMPLATE' } as TextDesignElement;
      const withEl = addDesignElement({ kind:'CARD_DESIGN', schemaVersion:1, id:'t', name:'T', version:1, status:'DRAFT', artboards:[artboard], sharedAssets:[] }, 'test-ab', textEl);
      const source = withEl.artboards[0]!;
      
      const resolvedA = resolveArtboardBindings(source, ctxA);
      const resolvedB = resolveArtboardBindings(source, ctxB);
      
      const elA = resolvedA.elements[0] as TextDesignElement;
      const elB = resolvedB.elements[0] as TextDesignElement;
      
      expect(elA.text).toBe('Hello Alice');
      expect(elB.text).toBe('Hello Bob');
    });

    it('QR value resolves per record', () => {
      const artboard = makeArtboard();
      const qrEl = { ...createQrElement({ id:'qr1', name:'QR', xMm:0, yMm:0, zIndex:1 }), bindings: [{ id:'bq', sourceType: 'FIELD', fieldPath:'QrValue', targetProperty:'value', fallbackValue: 'https://example.com' }] } as QrDesignElement;
      const withEl = addDesignElement({ kind:'CARD_DESIGN', schemaVersion:1, id:'t', name:'T', version:1, status:'DRAFT', artboards:[artboard], sharedAssets:[] }, 'test-ab', qrEl as any);
      const source = withEl.artboards[0]!;
      
      const resolvedA = resolveArtboardBindings(source, ctxA);
      const resolvedB = resolveArtboardBindings(source, ctxB);
      
      const qrA = resolvedA.elements[0] as QrDesignElement;
      const qrB = resolvedB.elements[0] as QrDesignElement;
      
      expect(qrA.value).toBe('https://qr.example.com/alice');
      expect(qrB.value).toBe('https://qr.example.com/bob');
    });

    it('conditional visibility flips per record', () => {
      const artboard = makeArtboard();
      const visRule: ElementVisibilityRule = { id:'vr', enabled:true, fieldPath:'Status', operator:'EQUALS', value:'Approved' };
      const shapeEl = { ...createShapeElement('CIRCLE', { id:'s1', xMm:0, yMm:0, zIndex:1 }), visibilityRule: visRule };
      const withEl = addDesignElement({ kind:'CARD_DESIGN', schemaVersion:1, id:'t', name:'T', version:1, status:'DRAFT', artboards:[artboard], sharedAssets:[] }, 'test-ab', shapeEl as any);
      const source = withEl.artboards[0]!;
      
      const resolvedA = resolveArtboardBindings(source, ctxA); // Status=Approved → visible
      const resolvedB = resolveArtboardBindings(source, ctxB); // Status=Draft → hidden
      
      expect(resolvedA.elements[0]!.runtimeHidden).toBe(false);
      expect(resolvedB.elements[0]!.runtimeHidden).toBe(true);
    });

    it('runtime state does not leak between records', () => {
      const artboard = makeArtboard();
      const visRule: ElementVisibilityRule = { id:'vr2', enabled:true, fieldPath:'Status', operator:'EQUALS', value:'Approved' };
      const shapeEl = { ...createShapeElement('RECTANGLE', { id:'s2', xMm:0, yMm:0, zIndex:1 }), visibilityRule: visRule };
      const withEl = addDesignElement({ kind:'CARD_DESIGN', schemaVersion:1, id:'t', name:'T', version:1, status:'DRAFT', artboards:[artboard], sharedAssets:[] }, 'test-ab', shapeEl as any);
      const source = withEl.artboards[0]!;
      
      // Resolve B (hidden) then re-resolve A (visible)
      const resolvedB = resolveArtboardBindings(source, ctxB);
      expect(resolvedB.elements[0]!.runtimeHidden).toBe(true);
      
      // Source must still be clean
      expect(source.elements[0]!.runtimeHidden).toBeUndefined();
      
      const resolvedA = resolveArtboardBindings(source, ctxA);
      expect(resolvedA.elements[0]!.runtimeHidden).toBe(false);
    });
  });

  describe('persistence invariant', () => {
    it('serialized artboard JSON does not contain runtimeHidden', () => {
      const artboard = makeArtboard();
      const visRule: ElementVisibilityRule = { id:'vr3', enabled:true, fieldPath:'Status', operator:'IS_EMPTY' };
      const shapeEl = { ...createShapeElement('RECTANGLE', { id:'s3', xMm:0, yMm:0, zIndex:1 }), visibilityRule: visRule };
      const withEl = addDesignElement({ kind:'CARD_DESIGN', schemaVersion:1, id:'t', name:'T', version:1, status:'DRAFT', artboards:[artboard], sharedAssets:[] }, 'test-ab', shapeEl as any);
      const source = withEl.artboards[0]!;
      
      // Resolve (this sets runtimeHidden on resolved clone)
      resolveArtboardBindings(source, ctxA);
      
      const serialized = JSON.stringify(source);
      expect(serialized).not.toContain('"runtimeHidden"');
    });

    it('visibilityRule is preserved in serialized artboard', () => {
      const artboard = makeArtboard();
      const visRule: ElementVisibilityRule = { id:'vr4', enabled:true, fieldPath:'Status', operator:'EQUALS', value:'Approved' };
      const shapeEl = { ...createShapeElement('RECTANGLE', { id:'s4', xMm:0, yMm:0, zIndex:1 }), visibilityRule: visRule };
      const withEl = addDesignElement({ kind:'CARD_DESIGN', schemaVersion:1, id:'t', name:'T', version:1, status:'DRAFT', artboards:[artboard], sharedAssets:[] }, 'test-ab', shapeEl as any);
      const source = withEl.artboards[0]!;
      
      const serialized = JSON.parse(JSON.stringify(source));
      expect(serialized.elements[0].visibilityRule).toMatchObject({ enabled: true, fieldPath: 'Status', operator: 'EQUALS' });
    });
  });

  describe('prototype pollution security', () => {
    it('blocked __proto__ path returns undefined', async () => {
      const { resolvePath } = await import('../src/bindings/resolver');
      expect(resolvePath({ a: 1 }, '__proto__')).toBeUndefined();
    });
    it('blocked constructor path returns undefined', async () => {
      const { resolvePath } = await import('../src/bindings/resolver');
      expect(resolvePath({ a: 1 }, 'constructor')).toBeUndefined();
    });
    it('blocked prototype path returns undefined', async () => {
      const { resolvePath } = await import('../src/bindings/resolver');
      expect(resolvePath({ a: 1 }, 'prototype')).toBeUndefined();
    });
  });

  describe('missing field safe defaults', () => {
    it('text template with missing field falls back gracefully', () => {
      const artboard = makeArtboard();
      const textEl = { ...createTextElement({ id:'tx', name:'T', xMm:0, yMm:0, zIndex:1 }), text:'Card: {{MissingField}}', textBindingMode: 'TEMPLATE' } as TextDesignElement;
      const withEl = addDesignElement({ kind:'CARD_DESIGN', schemaVersion:1, id:'t', name:'T', version:1, status:'DRAFT', artboards:[artboard], sharedAssets:[] }, 'test-ab', textEl);
      const source = withEl.artboards[0]!;
      const resolved = resolveArtboardBindings(source, ctxA);
      const el = resolved.elements[0] as TextDesignElement;
      // Should contain empty string in place of {{MissingField}}, not crash
      expect(el.text).toBe('Card: ');
    });

    it('visibility rule with missing field evaluates safely (hidden for EQUALS)', () => {
      const artboard = makeArtboard();
      const visRule: ElementVisibilityRule = { id:'vr5', enabled:true, fieldPath:'NonExistentField', operator:'EQUALS', value:'x' };
      const shapeEl = { ...createShapeElement('RECTANGLE', { id:'s5', xMm:0, yMm:0, zIndex:1 }), visibilityRule: visRule };
      const withEl = addDesignElement({ kind:'CARD_DESIGN', schemaVersion:1, id:'t', name:'T', version:1, status:'DRAFT', artboards:[artboard], sharedAssets:[] }, 'test-ab', shapeEl as any);
      const source = withEl.artboards[0]!;
      const resolved = resolveArtboardBindings(source, ctxA);
      // Should be hidden because missing field evaluates to empty string, which does not equal 'x'
      expect(resolved.elements[0]!.runtimeHidden).toBe(true);
    });
  });
});
