import { describe, expect, it } from 'vitest';
import type { PathDesignElement, ShapeDesignElement } from '@document-tool/contracts';
import { performBooleanSelection, performFragmentSelection, toBooleanPathElement } from '../src/boolean-selection.js';

const solid = { type:'SOLID', color:'#ff0000', opacity:1 } as const;
const stroke = { color:'#000000', widthMm:0.2, opacity:1, style:'SOLID', dashArrayMm:[], dashOffsetMm:0, lineCap:'BUTT', lineJoin:'MITER', miterLimit:4, alignment:'CENTER' } as const;
const base = { visible:true, locked:false, rotationDeg:0, opacity:1, zIndex:0, fill:solid, stroke };
function rect(id:string,x:number,y:number,w:number,h:number):ShapeDesignElement { return { ...base,id,name:id,type:'SHAPE',shape:'RECTANGLE',position:{xMm:x,yMm:y},size:{widthMm:w,heightMm:h} } as ShapeDesignElement; }

describe('Phase 8.7 boolean hardening',()=>{
 it('converts a closed SHAPE into a boolean PATH without losing style',()=>{
  const source=rect('a',0,0,20,20); const path=toBooleanPathElement(source)!;
  expect(path.type).toBe('PATH'); expect(path.fill).toEqual(source.fill); expect(path.stroke).toEqual(source.stroke); expect(path.geometry.closed).toBe(true);
 });
 it('uses primary element as subtract base independent of selection order',()=>{
  const a=rect('a',0,0,20,20), b=rect('b',10,0,20,20);
  const result=performBooleanSelection([b,a],'a','SUBTRACT');
  expect(result).not.toBeNull(); expect(result!.name).toBe('a'); expect(result!.size.widthMm).toBeCloseTo(10,4);
 });
 it('fragments two overlapping rectangles into three independent closed PATH regions',()=>{
  const a=rect('a',0,0,20,20), b=rect('b',10,0,20,20);
  const regions=performFragmentSelection([a,b],'a');
  expect(regions).toHaveLength(3);
  expect(regions.every(region=>region.type==='PATH' && region.geometry.closed)).toBe(true);
  expect(new Set(regions.map(region=>region.id)).size).toBe(3);
 });
 it('returns empty result for a non-overlapping intersection',()=>{
  const a=rect('a',0,0,10,10), b=rect('b',30,0,10,10);
  expect(performBooleanSelection([a,b],'a','INTERSECT')).toBeNull();
 });
});
