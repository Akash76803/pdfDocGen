import { describe, expect, it } from 'vitest';
import { createShapeElement } from '../src/elements.js';

describe('Phase 7.7 shape text model',()=>{
  it('is backward compatible and accepts inline text metadata',()=>{
    const shape=createShapeElement('RECTANGLE',{id:'shape-1'});
    expect(shape.label).toBeUndefined();
    const labeled={...shape,label:{enabled:true,text:'Hello',fontFamily:'Arial',fontSizePt:12,fontWeight:400,italic:false,underline:false,color:'#111827',alignment:'CENTER' as const,verticalAlignment:'CENTER' as const,paddingMm:2,lineHeight:1.2}};
    expect(labeled.label.text).toBe('Hello');
    expect(labeled.label.alignment).toBe('CENTER');
  });
});
