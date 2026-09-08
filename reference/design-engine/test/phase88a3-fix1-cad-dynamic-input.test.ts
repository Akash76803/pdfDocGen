import { describe,it,expect } from 'vitest';
import { normalizeCadAngleDeg,resolveCadDynamicEndpoint } from '../src/cadDynamicInput.js';

describe('Phase 8.8A3 Fix1 CAD dynamic input',()=>{
  it('resolves exact endpoint from length and angle',()=>{
    const p=resolveCadDynamicEndpoint({xMm:10,yMm:20},25,0);
    expect(p.xMm).toBeCloseTo(35,10);expect(p.yMm).toBeCloseTo(20,10);
  });
  it('supports arbitrary and normalized angles',()=>{
    const p=resolveCadDynamicEndpoint({xMm:0,yMm:0},Math.sqrt(200),45);
    expect(p.xMm).toBeCloseTo(10,10);expect(p.yMm).toBeCloseTo(10,10);
    expect(normalizeCadAngleDeg(-90)).toBe(270);
    expect(normalizeCadAngleDeg(450)).toBe(90);
  });
  it('rejects invalid lengths',()=>{
    expect(()=>resolveCadDynamicEndpoint({xMm:0,yMm:0},0,30)).toThrow();
  });
});
