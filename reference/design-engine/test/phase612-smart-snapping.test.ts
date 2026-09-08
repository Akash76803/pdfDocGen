import { describe,expect,it } from 'vitest';
import type { Artboard,DesignElement } from '@document-tool/contracts';
import { createBlankArtboard,createShapeElement,snapMoveDelta,snapResizeSize } from '../src/index.js';

function shape(id:string,x:number,y:number,w=10,h=10):DesignElement{return createShapeElement('RECTANGLE',{id,name:id,xMm:x,yMm:y,widthMm:w,heightMm:h});}
function artboard(elements:DesignElement[]=[]):Artboard{return {...createBlankArtboard({id:'a',name:'Front',order:0,widthMm:100,heightMm:60}),elements};}

describe('Phase 6.1.2 smart snapping',()=>{
 it('snaps moving selection to artboard center within tolerance',()=>{
  const a=artboard([shape('one',39,10,20,10)]);
  const r=snapMoveDelta(a,['one'],{xMm:0.6,yMm:0},{toleranceMm:1});
  expect(r.delta.xMm).toBeCloseTo(1);
  expect(r.guides).toContainEqual({axis:'X',positionMm:50,source:'ARTBOARD'});
 });
 it('snaps to another element edge and excludes moving elements as targets',()=>{
  const a=artboard([shape('one',10,10),shape('two',31,10)]);
  const r=snapMoveDelta(a,['one'],{xMm:10.4,yMm:0},{toleranceMm:1});
  expect(r.delta.xMm).toBeCloseTo(11);
  expect(r.guides.some(g=>g.source==='ELEMENT'&&g.positionMm===31)).toBe(true);
 });
 it('snaps to vertical and horizontal custom guides',()=>{
  const a={...artboard([shape('one',10,10)]),guides:[{id:'v',orientation:'VERTICAL' as const,positionMm:25},{id:'h',orientation:'HORIZONTAL' as const,positionMm:30}]};
  const r=snapMoveDelta(a,['one'],{xMm:4.4,yMm:9.4},{toleranceMm:1});
  expect(r.delta.xMm).toBeCloseTo(5);
  expect(r.delta.yMm).toBeCloseTo(10);
  expect(r.guides.map(g=>g.source)).toEqual(['GUIDE','GUIDE']);
 });
 it('supports optional grid snapping',()=>{
  const a=artboard([shape('one',11.2,13.2)]);
  const r=snapMoveDelta(a,['one'],{xMm:0,yMm:0},{toleranceMm:2,snapToArtboard:false,snapToElements:false,snapToGuides:false,snapToGrid:true,gridSizeMm:5});
  expect(r.delta.xMm).toBeCloseTo(-1.2);
  expect(r.delta.yMm).toBeCloseTo(1.8);
  expect(r.guides.every(g=>g.source==='GRID')).toBe(true);
 });
 it('does not snap when outside tolerance or disabled',()=>{
  const a=artboard([shape('one',17,17)]);
  expect(snapMoveDelta(a,['one'],{xMm:1,yMm:1},{toleranceMm:.2}).delta).toEqual({xMm:1,yMm:1});
  expect(snapMoveDelta(a,['one'],{xMm:20,yMm:20},{enabled:false}).guides).toHaveLength(0);
 });
 it('snaps resize east and south edges without moving the opposite anchor',()=>{
  const one=shape('one',10,10,19.4,19.4),a=artboard([one,shape('target',30,30,10,10)]);
  const r=snapResizeSize(a,one,'SE',{widthMm:19.4,heightMm:19.4},{toleranceMm:1});
  expect(r.size.widthMm).toBeCloseTo(20);
  expect(r.size.heightMm).toBeCloseTo(20);
  expect(r.guides.some(g=>g.axis==='X'&&g.positionMm===30)).toBe(true);
  expect(r.guides.some(g=>g.axis==='Y'&&g.positionMm===30)).toBe(true);
 });
 it('uses deterministic closest target when several candidates are nearby',()=>{
  const a=artboard([shape('one',39.2,10,20,10),shape('other',60.4,30)]);
  const r=snapMoveDelta(a,['one'],{xMm:0,yMm:0},{toleranceMm:1});
  expect(r.guides.find(g=>g.axis==='X')?.positionMm).toBe(50);
 });
});
