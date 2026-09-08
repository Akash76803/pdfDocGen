import { describe, expect, it } from 'vitest';
import type { PathGeometry } from '@document-tool/contracts';
import { convertPathSegmentToLine, deletePathPointsSafely, lineToCurve, setPathPointMode, validatePathGeometry } from '../src/index.js';

const openPath = (): PathGeometry => ({
  closed:false,
  points:[
    {id:'a',x:0,y:0,mode:'CORNER'},
    {id:'b',x:30,y:0,mode:'CORNER'},
    {id:'c',x:60,y:20,mode:'CORNER'}
  ],
  segments:[
    {id:'ab',type:'LINE',fromPointId:'a',toPointId:'b'},
    {id:'bc',type:'LINE',fromPointId:'b',toPointId:'c'}
  ]
});

describe('Phase 8.5 geometry editing completion',()=>{
  it('creates geometry-relative smooth handles instead of fixed-size handles',()=>{
    const smooth=setPathPointMode(openPath(),['b'],'SMOOTH');
    const b=smooth.points.find(point=>point.id==='b')!;
    expect(b.mode).toBe('SMOOTH');
    expect(b.inHandle).toBeDefined();
    expect(b.outHandle).toBeDefined();
    const inLen=Math.hypot(b.x-b.inHandle!.x,b.y-b.inHandle!.y);
    expect(inLen).toBeGreaterThan(5);
  });

  it('keeps symmetric handles opposite with equal length',()=>{
    const symmetric=setPathPointMode(openPath(),['b'],'SYMMETRIC');
    const b=symmetric.points.find(point=>point.id==='b')!;
    const inDx=b.x-b.inHandle!.x, inDy=b.y-b.inHandle!.y;
    const outDx=b.outHandle!.x-b.x, outDy=b.outHandle!.y-b.y;
    expect(Math.hypot(inDx,inDy)).toBeCloseTo(Math.hypot(outDx,outDy),6);
    expect(inDx*outDy-inDy*outDx).toBeCloseTo(0,6);
    expect(inDx*outDx+inDy*outDy).toBeGreaterThan(0);
  });

  it('cleans directional bezier handles when converting a curve back to line',()=>{
    const curved=lineToCurve(openPath(),'ab');
    expect(curved.points.find(point=>point.id==='a')!.outHandle).toBeDefined();
    expect(curved.points.find(point=>point.id==='b')!.inHandle).toBeDefined();
    const line=convertPathSegmentToLine(curved,'ab');
    expect(line.segments.find(segment=>segment.id==='ab')!.type).toBe('LINE');
    expect(line.points.find(point=>point.id==='a')!.outHandle).toBeUndefined();
    expect(line.points.find(point=>point.id==='b')!.inHandle).toBeUndefined();
  });

  it('rejects node deletion that would leave an invalid minimum open path',()=>{
    const source=openPath();
    const result=deletePathPointsSafely(source,['a','b']);
    expect(result.points).toHaveLength(3);
    expect(validatePathGeometry(result)).toBe(true);
  });

  it('allows safe deletion while retaining valid topology',()=>{
    const source=openPath();
    const result=deletePathPointsSafely(source,['b']);
    expect(result.points).toHaveLength(2);
    expect(result.segments).toHaveLength(1);
    expect(validatePathGeometry(result)).toBe(true);
  });
});
