import { describe,it,expect } from 'vitest';
import { createCadXLineGeometry,createCadXLineMetadata } from '../src/cadXLine.js';

describe('Phase 8.8A3 CAD XLINE',()=>{
  it('clips an infinite horizontal line to both artboard edges',()=>{
    const r=createCadXLineGeometry({xMm:50,yMm:20},{xMm:80,yMm:20},100,60);
    expect(r.clippedStart).toEqual({xMm:0,yMm:20});
    expect(r.clippedEnd).toEqual({xMm:100,yMm:20});
  });
  it('clips diagonal construction geometry to the artboard boundary',()=>{
    const r=createCadXLineGeometry({xMm:20,yMm:20},{xMm:40,yMm:40},100,80);
    expect(r.clippedStart.xMm).toBeCloseTo(0,8);
    expect(r.clippedStart.yMm).toBeCloseTo(0,8);
    expect(r.clippedEnd.xMm).toBeCloseTo(80,8);
    expect(r.clippedEnd.yMm).toBeCloseTo(80,8);
  });
  it('marks construction geometry editor-only and non-exporting',()=>{
    expect(createCadXLineMetadata({xMm:1,yMm:2},{xMm:3,yMm:4})).toMatchObject({cadGeometryKind:'XLINE',cadConstruction:true,cadExport:false,cadSectionCandidate:false,cadIntent:'GUIDE'});
  });
});
