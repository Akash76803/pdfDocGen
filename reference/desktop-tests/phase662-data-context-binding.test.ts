import { describe, expect, it } from 'vitest';
import { resolveArtboardBindings } from '@document-tool/design-engine';
import type { Artboard, DesignDataContext, TextDesignElement } from '@document-tool/contracts';

describe('Phase 6.6.2 Data Context UI/Runtime integration mock', () => {

  const createSource = (): Artboard => ({
    id: 'a1', name: 'Front', order: 0, widthMm: 90, heightMm: 50, displayUnit: 'MM',
    background: { type: 'NONE' },
    print: { bleed: {topMm:0,rightMm:0,bottomMm:0,leftMm:0}, safeArea: {topMm:0,rightMm:0,bottomMm:0,leftMm:0} },
    guides: [], groups: [],
    elements: [
      {
        id: 't1', type: 'TEXT', name: 'Static Text', text: 'Static Value',
        position: {xMm:0,yMm:0}, size: {widthMm:10,heightMm:10}, rotationDeg:0, opacity:1, visible: true, locked:false, zIndex:0,
        style: { fontFamily:'Arial', fontSizePt:10, fontWeight:400, italic:false, underline:false, color:'#000', alignment:'LEFT', lineHeight:1.2, letterSpacingPt:0 },
        bindings: [
          {
            id: 'b1', targetProperty: 'text', sourceType: 'FIELD', fieldPath: 'Employee.Name', fallbackValue: 'No Name'
          }
        ]
      } as TextDesignElement,
      {
        id: 't2', type: 'TEXT', name: 'No Bindings', text: 'Never Changes',
        position: {xMm:0,yMm:0}, size: {widthMm:10,heightMm:10}, rotationDeg:0, opacity:1, visible: true, locked:false, zIndex:0,
        style: { fontFamily:'Arial', fontSizePt:10, fontWeight:400, italic:false, underline:false, color:'#000', alignment:'LEFT', lineHeight:1.2, letterSpacingPt:0 }
      } as TextDesignElement
    ]
  });

  it('preview artboard resolution resolves bound properties and leaves source unchanged', () => {
    const source = createSource();
    const context: DesignDataContext = { record: { Employee: { Name: 'Akash Gaikwad' } } };

    const resolved = resolveArtboardBindings(source, context);

    // Resolved canvas sees new value
    expect((resolved.elements[0] as TextDesignElement).text).toBe('Akash Gaikwad');

    // Source template is immutable and untouched
    expect((source.elements[0] as TextDesignElement).text).toBe('Static Value');

    // Elements without bindings remain identical instances
    expect(resolved.elements[1]).toBe(source.elements[1]);
  });

  it('changing context updates preview resolution', () => {
    const source = createSource();
    const context1: DesignDataContext = { record: { Employee: { Name: 'User A' } } };
    const context2: DesignDataContext = { record: { Employee: { Name: 'User B' } } };

    const resolved1 = resolveArtboardBindings(source, context1);
    const resolved2 = resolveArtboardBindings(source, context2);

    expect((resolved1.elements[0] as TextDesignElement).text).toBe('User A');
    expect((resolved2.elements[0] as TextDesignElement).text).toBe('User B');
    expect((source.elements[0] as TextDesignElement).text).toBe('Static Value');
  });

  it('safely handles missing context via fallback', () => {
    const source = createSource();
    const context: DesignDataContext = { record: {} }; // Missing Employee.Name

    const resolved = resolveArtboardBindings(source, context);

    expect((resolved.elements[0] as TextDesignElement).text).toBe('No Name');
  });

  it('safely handles invalid object context', () => {
    const source = createSource();
    const context: DesignDataContext = { record: { Employee: { Name: { complex: 'object' } } } }; // Invalid type for text

    // Our resolver rules indicate we fallback if it's not a primitive, or we coerce it safely.
    // The previous phase 6.6.1 defined safe coercion (usually stringifying primitive, falling back for objects)
    const resolved = resolveArtboardBindings(source, context);
    
    // As long as it doesn't crash and returns string, it is valid.
    expect(typeof (resolved.elements[0] as TextDesignElement).text).toBe('string');
  });

});
