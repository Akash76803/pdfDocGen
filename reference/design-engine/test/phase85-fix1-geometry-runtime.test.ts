import { describe, expect, it } from 'vitest';
import type { PathGeometry } from '@document-tool/contracts';
import { setPathPointMode } from '../src/index.js';

const path = (): PathGeometry => ({
  closed:false,
  points:[
    {id:'a',x:0,y:0,mode:'CORNER'},
    {id:'b',x:30,y:0,mode:'CORNER'},
    {id:'c',x:60,y:15,mode:'CORNER'}
  ],
  segments:[
    {id:'ab',type:'LINE',fromPointId:'a',toPointId:'b'},
    {id:'bc',type:'LINE',fromPointId:'b',toPointId:'c'}
  ]
});

describe('Phase 8.5 Fix1 visible node-mode runtime',()=>{
  it('promotes connected line segments to cubic when Smooth is applied',()=>{
    const result=setPathPointMode(path(),['b'],'SMOOTH');
    expect(result.segments.find(s=>s.id==='ab')?.type).toBe('CUBIC_BEZIER');
    expect(result.segments.find(s=>s.id==='bc')?.type).toBe('CUBIC_BEZIER');
    expect(result.points.find(p=>p.id==='b')?.inHandle).toBeDefined();
    expect(result.points.find(p=>p.id==='b')?.outHandle).toBeDefined();
  });

  it('promotes connected line segments to cubic when Symmetric is applied',()=>{
    const result=setPathPointMode(path(),['b'],'SYMMETRIC');
    expect(result.segments.every(s=>s.type==='CUBIC_BEZIER')).toBe(true);
  });
});
