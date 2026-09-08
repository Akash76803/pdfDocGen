import { describe, expect, it } from 'vitest';
import type { ShapeDesignElement } from '@document-tool/contracts';
import {
  canBooleanSelection,
  canFragmentSelection,
  orderBooleanSelection,
  performBooleanSelection,
  performFragmentSelection,
} from '../src/index.js';

const stroke={color:'#111111',widthMm:0.5,style:'SOLID' as const};
function rect(id:string,x:number,y:number,w:number,h:number,color:string,zIndex=0):ShapeDesignElement{
  return {id,type:'SHAPE',shape:'RECTANGLE',name:id,position:{xMm:x,yMm:y},size:{widthMm:w,heightMm:h},rotationDeg:0,opacity:1,visible:true,locked:false,zIndex,fill:{type:'SOLID',color},stroke};
}

describe('Phase 8.7 boolean hardening + Fragment',()=>{
  it('uses the explicit primary element as deterministic first boolean operand',()=>{
    const a=rect('a',0,0,20,20,'#ff0000');
    const b=rect('b',10,0,20,20,'#00ff00');
    expect(orderBooleanSelection([a,b],'b').map(e=>e.id)).toEqual(['b','a']);
    const result=performBooleanSelection([a,b],'b','SUBTRACT');
    expect(result?.fill).toEqual(b.fill);
  });

  it('supports 2+ closed SHAPE/PATH-compatible vector operands',()=>{
    const a=rect('a',0,0,20,20,'#ff0000');
    const b=rect('b',10,0,20,20,'#00ff00');
    const c=rect('c',15,0,20,20,'#0000ff');
    expect(canBooleanSelection([a,b,c])).toBe(true);
    const union=performBooleanSelection([a,b,c],'a','UNION');
    expect(union?.type).toBe('PATH');
    expect(union?.fill).toEqual(a.fill);
  });

  it('rejects locked/open/incompatible operands before mutation',()=>{
    const a=rect('a',0,0,20,20,'#ff0000');
    const locked={...rect('b',10,0,20,20,'#00ff00'),locked:true};
    const line={...rect('line',0,0,20,1,'#000000'),shape:'LINE' as const};
    expect(canBooleanSelection([a,locked])).toBe(false);
    expect(canBooleanSelection([a,line])).toBe(false);
    expect(canFragmentSelection([a,locked])).toBe(false);
  });

  it('fragments two overlapping closed vectors into three independent closed PATH regions',()=>{
    const primary=rect('primary',0,0,20,20,'#ff0000',1);
    const secondary=rect('secondary',10,0,20,20,'#00ff00',2);
    expect(canFragmentSelection([primary,secondary])).toBe(true);
    const fragments=performFragmentSelection([primary,secondary],primary.id);
    expect(fragments).toHaveLength(3);
    expect(fragments.every(fragment=>fragment.type==='PATH' && fragment.geometry.points.length>=3)).toBe(true);
    expect(fragments.every(fragment=>fragment.geometry.closed || fragment.geometry.subpaths?.every(sub=>sub.closed))).toBe(true);
    expect(new Set(fragments.map(fragment=>fragment.id)).size).toBe(3);
    expect(fragments[0]?.fill).toEqual(primary.fill);
    expect(fragments[1]?.fill).toEqual(primary.fill);
    expect(fragments[2]?.fill).toEqual(secondary.fill);
  });

  it('keeps XOR holes as compound geometry instead of filling the hole',()=>{
    const outer=rect('outer',0,0,30,30,'#ff0000');
    const inner=rect('inner',10,10,10,10,'#00ff00');
    const donut=performBooleanSelection([outer,inner],outer.id,'EXCLUDE');
    expect(donut).not.toBeNull();
    expect(donut?.geometry.subpaths?.length).toBeGreaterThanOrEqual(2);
  });
});
