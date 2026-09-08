import { describe, expect, it } from 'vitest';
import { createCadLineGeometry, createCadLineMetadata } from '../src/cadLine.js';

describe('Phase 8.8A1 CAD LINE hardening',()=>{
  it('preserves exact world endpoints without rounding',()=>{
    const start={xMm:12.3456789,yMm:8.7654321};
    const end={xMm:41.2345678,yMm:27.8765432};
    const result=createCadLineGeometry(start,end,{point1Id:'a',point2Id:'b',segmentId:'ab'});
    const a=result.geometry.points.find(p=>p.id==='a')!;
    const b=result.geometry.points.find(p=>p.id==='b')!;
    expect(result.position.xMm+a.x).toBe(start.xMm);
    expect(result.position.yMm+a.y).toBe(start.yMm);
    expect(result.position.xMm+b.x).toBe(end.xMm);
    expect(result.position.yMm+b.y).toBe(end.yMm);
    expect(result.geometry.closed).toBe(false);
    expect(result.geometry.segments).toEqual([{id:'ab',type:'LINE',fromPointId:'a',toPointId:'b'}]);
  });

  it('reports deterministic length/angle and section-ready metadata',()=>{
    const result=createCadLineGeometry({xMm:0,yMm:0},{xMm:10,yMm:10},{point1Id:'a',point2Id:'b',segmentId:'ab'});
    expect(result.lengthMm).toBeCloseTo(Math.sqrt(200),10);
    expect(result.angleDeg).toBeCloseTo(45,10);
    expect(createCadLineMetadata('shape-a','shape-b')).toMatchObject({cadGeometryKind:'LINE',cadSectionCandidate:true,cadStartTargetId:'shape-a',cadEndTargetId:'shape-b',dividerBoundaryTargetId:'shape-a'});
  });
});
