import { describe, expect, it } from 'vitest';
import type { DesignTemplate, PathDesignElement, ShapeDesignElement } from '@document-tool/contracts';
import { createBlankArtboard, flipElementsInPlace, getSelectionBounds, resizeElement, resizeElementsFromSnapshots, resizeSelectionBoundsFromDelta, setElementsPositionAxis, setElementsRotation, setElementsSizeDimension, snapRotationDeg, worldDeltaToElementLocal } from '../src/index.js';

const shape=(overrides:Partial<ShapeDesignElement>={}):ShapeDesignElement=>({
  id:'shape',type:'SHAPE',name:'Shape',position:{xMm:10,yMm:20},size:{widthMm:40,heightMm:20},rotationDeg:0,
  opacity:1,visible:true,locked:false,zIndex:0,shape:'RECTANGLE',fill:{type:'SOLID',color:'#fff'},stroke:{color:'#000',widthMm:.2,style:'SOLID'},...overrides,
});
const path=():PathDesignElement=>({
  id:'path',type:'PATH',name:'Path',position:{xMm:0,yMm:0},size:{widthMm:20,heightMm:10},rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:0,
  geometry:{closed:true,points:[
    {id:'a',x:0,y:0,mode:'CORNER',outHandle:{x:4,y:0}},
    {id:'b',x:20,y:0,mode:'SMOOTH',inHandle:{x:16,y:0},outHandle:{x:20,y:4}},
    {id:'c',x:20,y:10,mode:'CORNER'},
  ],segments:[{id:'ab',type:'CUBIC_BEZIER',fromPointId:'a',toPointId:'b'},{id:'bc',type:'LINE',fromPointId:'b',toPointId:'c'},{id:'ca',type:'LINE',fromPointId:'c',toPointId:'a'}]},
  fill:{type:'SOLID',color:'#fff'},stroke:{color:'#000',widthMm:.2,style:'SOLID'},
});
const template=(elements=[shape()] as any[]):DesignTemplate=>({kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'T',version:1,status:'DRAFT',sharedAssets:[],artboards:[{...createBlankArtboard({id:'a',name:'Front',order:0,widthMm:100,heightMm:60}),elements}]});

const worldPoint=(element:ShapeDesignElement, local:{xMm:number;yMm:number})=>{
  const center={xMm:element.position.xMm+element.size.widthMm/2,yMm:element.position.yMm+element.size.heightMm/2};
  const r=element.rotationDeg*Math.PI/180,cos=Math.cos(r),sin=Math.sin(r);
  return {xMm:center.xMm+local.xMm*cos-local.yMm*sin,yMm:center.yMm+local.xMm*sin+local.yMm*cos};
};

describe('Phase 8.1 transform hardening',()=>{
  it('converts world pointer delta into element-local axes for rotated resize',()=>{
    const local=worldDeltaToElementLocal({xMm:10,yMm:0},90);
    expect(local.xMm).toBeCloseTo(0,8);
    expect(local.yMm).toBeCloseTo(-10,8);
  });

  it('keeps the opposite visual anchor fixed when resizing a rotated element',()=>{
    const source=shape({rotationDeg:37});
    const oldOpposite=worldPoint(source,{xMm:-source.size.widthMm/2,yMm:-source.size.heightMm/2}); // NW opposite SE drag
    const next=resizeElement(template([source]),'a',source.id,{widthMm:60,heightMm:30},{anchor:'SE'}).artboards[0]!.elements[0] as ShapeDesignElement;
    const newOpposite=worldPoint(next,{xMm:-next.size.widthMm/2,yMm:-next.size.heightMm/2});
    expect(newOpposite.xMm).toBeCloseTo(oldOpposite.xMm,8);
    expect(newOpposite.yMm).toBeCloseTo(oldOpposite.yMm,8);
  });

  it('supports center-based resizing without moving the visual center',()=>{
    const source=shape({rotationDeg:55});
    const before={xMm:source.position.xMm+source.size.widthMm/2,yMm:source.position.yMm+source.size.heightMm/2};
    const next=resizeElement(template([source]),'a',source.id,{widthMm:70,heightMm:25},{anchor:'E',centerBased:true}).artboards[0]!.elements[0]!;
    expect(next.position.xMm+next.size.widthMm/2).toBeCloseTo(before.xMm,8);
    expect(next.position.yMm+next.size.heightMm/2).toBeCloseTo(before.yMm,8);
  });

  it('snaps rotation to 15 degree increments on demand',()=>{
    expect(snapRotationDeg(22,15)).toBe(15);
    expect(snapRotationDeg(23,15)).toBe(30);
    expect(snapRotationDeg(-7,15)).toBe(0);
  });

  it('flips shapes in place without changing placement or creating a copy',()=>{
    const source=shape();
    const next=flipElementsInPlace(template([source]),'a',[source.id],'VERTICAL');
    const result=next.artboards[0]!.elements[0] as ShapeDesignElement;
    expect(next.artboards[0]!.elements).toHaveLength(1);
    expect(result.id).toBe(source.id);
    expect(result.position).toEqual(source.position);
    expect(result.size).toEqual(source.size);
    expect(result.flipX).toBe(true);
  });

  it('reflects PATH nodes and Bezier handles in place while preserving topology IDs',()=>{
    const source=path();
    const next=flipElementsInPlace(template([source]),'a',[source.id],'VERTICAL');
    const result=next.artboards[0]!.elements[0] as PathDesignElement;
    expect(result.geometry.points.map(p=>p.id)).toEqual(['a','b','c']);
    expect(result.geometry.segments.map(s=>s.id)).toEqual(['ab','bc','ca']);
    expect(result.geometry.points[0]).toMatchObject({x:20,y:0,outHandle:{x:16,y:0}});
    expect(result.geometry.points[1]).toMatchObject({x:0,y:0,inHandle:{x:4,y:0},outHandle:{x:0,y:4}});
  });

  it('supports deterministic exact multi-edit helpers while respecting locked elements',()=>{
    const one=shape({id:'one',position:{xMm:5,yMm:4},size:{widthMm:20,heightMm:10}});
    const two=shape({id:'two',position:{xMm:30,yMm:8},size:{widthMm:15,heightMm:8}});
    const locked=shape({id:'locked',position:{xMm:60,yMm:12},locked:true});
    let next=template([one,two,locked]);
    next=setElementsPositionAxis(next,'a',['one','two','locked'],'X',12);
    next=setElementsRotation(next,'a',['one','two','locked'],33);
    next=setElementsSizeDimension(next,'a',['one','two','locked'],'WIDTH',25);
    const [a,b,c]=next.artboards[0]!.elements as ShapeDesignElement[];
    expect(a.position.xMm).toBeCloseTo(12,8);
    expect(b.position.xMm).toBeCloseTo(12,8);
    expect(a.rotationDeg).toBe(33);
    expect(b.rotationDeg).toBe(33);
    expect(a.size.widthMm).toBe(25);
    expect(b.size.widthMm).toBe(25);
    expect(c.position.xMm).toBe(60);
    expect(c.rotationDeg).toBe(0);
    expect(c.size.widthMm).toBe(40);
  });

  it('does not transform locked elements during in-place flip',()=>{
    const source=shape({locked:true});
    const result=flipElementsInPlace(template([source]),'a',[source.id],'VERTICAL').artboards[0]!.elements[0] as ShapeDesignElement;
    expect(result.flipX).toBeUndefined();
  });

  it('resizes a multi-selection from the shared bounding box while preserving relative layout',()=>{
    const one=shape({id:'one',position:{xMm:10,yMm:10},size:{widthMm:20,heightMm:10}});
    const two=shape({id:'two',position:{xMm:40,yMm:20},size:{widthMm:10,heightMm:20}});
    const snapshots=[one,two];
    const bounds=getSelectionBounds(snapshots)!;
    const target=resizeSelectionBoundsFromDelta(bounds,'SE',{xMm:20,yMm:10});
    const next=resizeElementsFromSnapshots(template(snapshots),'a',snapshots,bounds,target);
    const [a,b]=next.artboards[0]!.elements as ShapeDesignElement[];
    expect(a.position.xMm).toBeCloseTo(10,8);
    expect(a.position.yMm).toBeCloseTo(10,8);
    expect(a.size.widthMm).toBeCloseTo(30,8);
    expect(a.size.heightMm).toBeCloseTo(13.3333333333,6);
    expect(b.position.xMm).toBeCloseTo(55,8);
    expect(b.position.yMm).toBeCloseTo(23.3333333333,6);
  });

  it('supports Alt-style center resize for a multi-selection',()=>{
    const one=shape({id:'one',position:{xMm:10,yMm:10},size:{widthMm:20,heightMm:10}});
    const two=shape({id:'two',position:{xMm:40,yMm:20},size:{widthMm:10,heightMm:20}});
    const bounds=getSelectionBounds([one,two])!;
    const beforeCenter={xMm:bounds.xMm+bounds.widthMm/2,yMm:bounds.yMm+bounds.heightMm/2};
    const target=resizeSelectionBoundsFromDelta(bounds,'SE',{xMm:10,yMm:5},{centerBased:true});
    expect(target.xMm+target.widthMm/2).toBeCloseTo(beforeCenter.xMm,8);
    expect(target.yMm+target.heightMm/2).toBeCloseTo(beforeCenter.yMm,8);
    expect(target.widthMm).toBeCloseTo(bounds.widthMm+20,8);
    expect(target.heightMm).toBeCloseTo(bounds.heightMm+10,8);
  });

  it('supports Shift-style aspect locking for a multi-selection',()=>{
    const bounds={xMm:10,yMm:15,widthMm:60,heightMm:30};
    const target=resizeSelectionBoundsFromDelta(bounds,'SE',{xMm:30,yMm:4},{maintainAspectRatio:true});
    expect(target.widthMm/target.heightMm).toBeCloseTo(2,8);
    expect(target.xMm).toBeCloseTo(10,8);
    expect(target.yMm).toBeCloseTo(15,8);
  });

  it('combines Alt + Shift for centered aspect-locked multi-selection resize',()=>{
    const bounds={xMm:10,yMm:10,widthMm:80,heightMm:40};
    const target=resizeSelectionBoundsFromDelta(bounds,'SE',{xMm:10,yMm:2},{centerBased:true,maintainAspectRatio:true});
    expect(target.widthMm/target.heightMm).toBeCloseTo(2,8);
    expect(target.xMm+target.widthMm/2).toBeCloseTo(50,8);
    expect(target.yMm+target.heightMm/2).toBeCloseTo(30,8);
  });

  it('scales PATH geometry from drag-start snapshots during multi-selection resize',()=>{
    const p=path();
    const s=shape({id:'shape-two',position:{xMm:30,yMm:0},size:{widthMm:10,heightMm:10}});
    const snapshots=[p,s];
    const bounds=getSelectionBounds(snapshots)!;
    const target={...bounds,widthMm:bounds.widthMm*2,heightMm:bounds.heightMm*2};
    const next=resizeElementsFromSnapshots(template(snapshots),'a',snapshots,bounds,target);
    const result=next.artboards[0]!.elements[0] as PathDesignElement;
    expect(result.size.widthMm).toBeCloseTo(40,8);
    expect(result.size.heightMm).toBeCloseTo(20,8);
    expect(result.geometry.points.find(point=>point.id==='b')?.x).toBeCloseTo(40,8);
    expect(result.geometry.points.find(point=>point.id==='c')?.y).toBeCloseTo(20,8);
  });

});
