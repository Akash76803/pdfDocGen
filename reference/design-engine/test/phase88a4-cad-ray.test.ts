import { describe, expect, it } from 'vitest';
import { createCadRayGeometry, createCadRayMetadata } from '../src/cadRay.js';

describe('Phase 8.8A4 CAD Ray',()=>{
  it('clips a horizontal ray only in the forward direction',()=>{
    const r=createCadRayGeometry({xMm:20,yMm:30},{xMm:40,yMm:30},100,60);
    expect(r.origin).toEqual({xMm:20,yMm:30});
    expect(r.clippedEnd).toEqual({xMm:100,yMm:30});
    expect(r.angleDeg).toBeCloseTo(0,8);
  });
  it('clips a diagonal ray to the first forward artboard boundary',()=>{
    const r=createCadRayGeometry({xMm:20,yMm:20},{xMm:40,yMm:40},100,60);
    expect(r.clippedEnd.xMm).toBeCloseTo(60,8);
    expect(r.clippedEnd.yMm).toBeCloseTo(60,8);
    expect(r.angleDeg).toBeCloseTo(45,8);
  });
  it('marks rays as non-exporting construction guides',()=>{
    expect(createCadRayMetadata({xMm:1,yMm:2},{xMm:3,yMm:4})).toMatchObject({cadGeometryKind:'RAY',cadConstruction:true,cadExport:false,cadIntent:'GUIDE'});
  });
});
