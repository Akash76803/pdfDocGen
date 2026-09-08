import {describe,expect,it} from 'vitest';
import {createCadArcGeometry,createCadArcMetadata} from '../src/index.js';

describe('Phase 8.8B1 CAD Arc',()=>{
 it('creates an editable open cubic arc through three exact points',()=>{
  const built=createCadArcGeometry({xMm:0,yMm:10},{xMm:10,yMm:0},{xMm:20,yMm:10},{startId:'a',throughId:'b',endId:'c',segment1Id:'s1',segment2Id:'s2'});
  expect(built).not.toBeNull();
  expect(built?.geometry.closed).toBe(false);
  expect(built?.geometry.points).toHaveLength(3);
  expect(built?.geometry.segments.map(segment=>segment.type)).toEqual(['CUBIC_BEZIER','CUBIC_BEZIER']);
  expect(built?.radiusMm).toBeCloseTo(10);
  expect(built?.geometry.points.find(point=>point.id==='b')).toBeDefined();
 });
 it('rejects collinear points instead of producing corrupt geometry',()=>{
  expect(createCadArcGeometry({xMm:0,yMm:0},{xMm:10,yMm:0},{xMm:20,yMm:0})).toBeNull();
 });
 it('marks the arc printable and non-sectioning',()=>{
  const built=createCadArcGeometry({xMm:0,yMm:10},{xMm:10,yMm:0},{xMm:20,yMm:10})!;
  expect(createCadArcMetadata({xMm:0,yMm:10},{xMm:10,yMm:0},{xMm:20,yMm:10},built)).toMatchObject({cadGeometryKind:'ARC',cadExport:true,cadSectionCandidate:false});
 });
});
