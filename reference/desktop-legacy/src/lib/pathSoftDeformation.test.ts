import { describe, expect, it } from 'vitest';
import { calculateSoftPathWeights } from './pathSoftDeformation.js';

const line={
  closed:false,
  points:Array.from({length:5},(_,i)=>({id:`p${i}`,x:i*10,y:0})),
  segments:Array.from({length:4},(_,i)=>({fromPointId:`p${i}`,toPointId:`p${i+1}`,type:'LINE'})),
};

describe('path soft deformation',()=>{
  it('keeps the dragged node at full influence and falls off along topology',()=>{
    const w=calculateSoftPathWeights(line,['p2'],{radiusMm:25,falloff:'SMOOTH',strength:1,preserveEnds:false});
    expect(w.get('p2')).toBe(1);
    expect(w.get('p1')!).toBeGreaterThan(w.get('p0')!);
    expect(w.get('p3')).toBeCloseTo(w.get('p1')!,6);
  });
  it('can preserve open path endpoints',()=>{
    const w=calculateSoftPathWeights(line,['p2'],{radiusMm:100,falloff:'LINEAR',strength:1,preserveEnds:true});
    expect(w.get('p0')).toBe(0);
    expect(w.get('p4')).toBe(0);
  });
  it('does not affect disconnected geometry',()=>{
    const geometry={...line,points:[...line.points,{id:'isolated',x:20,y:1}],segments:line.segments};
    const w=calculateSoftPathWeights(geometry,['p2'],{radiusMm:100});
    expect(w.get('isolated')).toBe(0);
  });
});
