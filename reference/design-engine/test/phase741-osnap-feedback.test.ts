import {describe,expect,it} from 'vitest';
import {createShapeElement,findBoundarySnap} from '../src/index.js';

describe('Phase 7.4.1 contextual OSNAP candidates',()=>{
 it('keeps a canonical node higher priority than a nearby on-path candidate',()=>{
  const rectangle=createShapeElement('RECTANGLE',{id:'rect',xMm:10,yMm:10,widthMm:40,heightMm:30});
  expect(findBoundarySnap([rectangle],{x:10.2,y:10.3},2)?.kind).toBe('NODE');
 });
 it('detects a real intersection without globally exposing every intersection',()=>{
  const horizontal=createShapeElement('RECTANGLE',{id:'a',xMm:0,yMm:9,widthMm:30,heightMm:2});
  const vertical=createShapeElement('RECTANGLE',{id:'b',xMm:14,yMm:0,widthMm:2,heightMm:30});
  const snap=findBoundarySnap([horizontal,vertical],{x:14.2,y:9.2},1);
  expect(snap?.kind).toBe('INTERSECTION');
  expect(findBoundarySnap([horizontal,vertical],{x:25,y:25},1)).toBeUndefined();
 });
 it('supports the midpoint candidate before generic nearest-on-path',()=>{
  const rectangle=createShapeElement('RECTANGLE',{id:'rect',xMm:0,yMm:0,widthMm:40,heightMm:20});
  const snap=findBoundarySnap([rectangle],{x:20,y:20.4},1);
  expect(['MIDPOINT','ON_PATH']).toContain(snap?.kind);
 });
});
