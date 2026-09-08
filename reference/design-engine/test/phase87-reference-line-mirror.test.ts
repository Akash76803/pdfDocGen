import {describe,expect,it} from 'vitest';
import type {DesignTemplate,ShapeDesignElement,PathDesignElement} from '@document-tool/contracts';
import {mirrorElementsAcrossReferenceLine,shapeToPathGeometry} from '../src/index.js';

const stroke={color:'#111111',widthMm:0.5,style:'SOLID' as const};
function shape(id:string,x:number,y:number,w=20,h=10,rotationDeg=0,groupId?:string):ShapeDesignElement{
 return {id,type:'SHAPE',shape:'TRIANGLE',name:id,position:{xMm:x,yMm:y},size:{widthMm:w,heightMm:h},rotationDeg,opacity:1,visible:true,locked:false,zIndex:1,groupId,fill:{type:'SOLID',color:'#ff0000'},stroke};
}
function template(elements:any[],groups:any[]=[]):DesignTemplate{return {kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'t',version:1,status:'DRAFT',sharedAssets:[],artboards:[{id:'a',name:'A',order:0,widthMm:100,heightMm:100,displayUnit:'MM',background:{type:'SOLID',color:'#ffffff'},elements,groups,guides:[]} as any]};}

describe('Phase 8.7 add-on CAD reference-line mirror',()=>{
 it('mirrors a shape across an arbitrary 45-degree reference axis in MOVE mode',()=>{
  const source=shape('s',10,30,20,10,20); // center = (20,35)
  const next=mirrorElementsAcrossReferenceLine(template([source]),'a',['s'],{xMm:0,yMm:0},{xMm:100,yMm:100},'MOVE');
  const result=next.artboards[0]!.elements[0] as ShapeDesignElement;
  expect(result.id).toBe('s');
  expect(result.position.xMm).toBeCloseTo(25,5); // reflected center (35,20), minus half width
  expect(result.position.yMm).toBeCloseTo(15,5);
  expect(result.rotationDeg).toBeCloseTo(70,5); // 2*45 - 20
  expect(result.flipY).toBe(true);
 });

 it('COPY keeps the source and clones group membership with new ids',()=>{
  const g={id:'g',name:'Logo',elementIds:['a','b'],visible:true,locked:false};
  const next=mirrorElementsAcrossReferenceLine(template([shape('a',10,10,10,10,0,'g'),shape('b',25,10,10,10,0,'g')],[g]),'a',['a','b'],{xMm:50,yMm:0},{xMm:50,yMm:100},'COPY');
  const art=next.artboards[0]!;
  expect(art.elements).toHaveLength(4);
  expect(art.groups).toHaveLength(2);
  const copies=art.elements.filter(e=>e.id!=='a'&&e.id!=='b');
  expect(copies).toHaveLength(2);
  expect(copies.every(e=>Boolean(e.groupId)&&e.groupId!=='g')).toBe(true);
  expect(new Set(copies.map(e=>e.groupId)).size).toBe(1);
 });

 it('mirrors PATH local nodes/handles while preserving the element id in MOVE mode',()=>{
  const base=shape('p',10,20,20,20,15);
  const path={...base,type:'PATH',geometry:shapeToPathGeometry('TRIANGLE',base.size)} as unknown as PathDesignElement;
  const beforeY=path.geometry.points[0]!.y;
  const next=mirrorElementsAcrossReferenceLine(template([path]),'a',['p'],{xMm:0,yMm:50},{xMm:100,yMm:50},'MOVE');
  const result=next.artboards[0]!.elements[0] as PathDesignElement;
  expect(result.id).toBe('p');
  expect(result.geometry.points[0]!.y).toBeCloseTo(path.size.heightMm-beforeY,5);
  expect(result.rotationDeg).toBeCloseTo(345,5);
 });

 it('does nothing for a degenerate reference line',()=>{
  const source=shape('s',10,10);
  const original=template([source]);
  const next=mirrorElementsAcrossReferenceLine(original,'a',['s'],{xMm:10,yMm:10},{xMm:10,yMm:10},'MOVE');
  expect(next).toBe(original);
 });
});
