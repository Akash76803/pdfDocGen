import { describe, expect, it } from 'vitest';
import type { DesignTemplate, PathDesignElement, ShapeDesignElement } from '@document-tool/contracts';
import { alignElements, createBlankArtboard, matchElementsSize, setElementsPositionAxis, setElementsRotation, setElementsSizeDimension } from '../src/index.js';

const shape=(id:string,x:number,y:number,w:number,h:number,locked=false):ShapeDesignElement=>({
  id,type:'SHAPE',name:id,position:{xMm:x,yMm:y},size:{widthMm:w,heightMm:h},rotationDeg:0,opacity:1,visible:true,locked,zIndex:0,
  shape:'RECTANGLE',fill:{type:'SOLID',color:'#fff'},stroke:{color:'#000',widthMm:.2,style:'SOLID'}
});
const path=(id:string,x:number,y:number,w:number,h:number):PathDesignElement=>({
  id,type:'PATH',name:id,position:{xMm:x,yMm:y},size:{widthMm:w,heightMm:h},rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:0,
  geometry:{closed:true,points:[{id:'a',x:0,y:0},{id:'b',x:w,y:0},{id:'c',x:w,y:h}],segments:[{id:'ab',type:'LINE',fromPointId:'a',toPointId:'b'},{id:'bc',type:'LINE',fromPointId:'b',toPointId:'c'},{id:'ca',type:'LINE',fromPointId:'c',toPointId:'a'}]},
  fill:{type:'SOLID',color:'#fff'},stroke:{color:'#000',widthMm:.2,style:'SOLID'}
});
const tpl=(elements:any[]):DesignTemplate=>({kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'T',version:1,status:'DRAFT',sharedAssets:[],artboards:[{...createBlankArtboard({id:'a',name:'A',order:0,widthMm:100,heightMm:80}),elements}]});

describe('Phase 8.3 multi-selection enhancements',()=>{
  it('aligns selected elements to the primary element bounds',()=>{
    const primary=shape('p',30,20,20,10),other=shape('o',5,45,10,8);
    const next=alignElements(tpl([primary,other]),'a',['p','o'],'LEFT','PRIMARY','p');
    expect(next.artboards[0]!.elements.find(e=>e.id==='p')!.position.xMm).toBe(30);
    expect(next.artboards[0]!.elements.find(e=>e.id==='o')!.position.xMm).toBe(30);
  });

  it('keeps primary fixed and matches width/height/size on unlocked targets',()=>{
    const primary=shape('p',10,10,40,25),other=shape('o',60,10,15,8),locked=shape('l',80,10,12,6,true);
    let next=matchElementsSize(tpl([primary,other,locked]),'a',['p','o','l'],'p','BOTH');
    const p=next.artboards[0]!.elements.find(e=>e.id==='p')!,o=next.artboards[0]!.elements.find(e=>e.id==='o')!,l=next.artboards[0]!.elements.find(e=>e.id==='l')!;
    expect(p.size).toEqual({widthMm:40,heightMm:25});
    expect(o.size).toEqual({widthMm:40,heightMm:25});
    expect(l.size).toEqual({widthMm:12,heightMm:6});
  });

  it('scales PATH geometry when matching dimensions',()=>{
    const primary=shape('p',0,0,40,20),target=path('path',50,0,10,5);
    const next=matchElementsSize(tpl([primary,target]),'a',['p','path'],'p','BOTH');
    const result=next.artboards[0]!.elements.find(e=>e.id==='path') as PathDesignElement;
    expect(result.size).toEqual({widthMm:40,heightMm:20});
    expect(result.geometry.points.find(p=>p.id==='b')?.x).toBeCloseTo(40,8);
    expect(result.geometry.points.find(p=>p.id==='c')?.y).toBeCloseTo(20,8);
  });

  it('applies exact X/Y/W/H/rotation to all unlocked selected elements',()=>{
    let next=tpl([shape('a1',1,2,10,12),shape('a2',20,30,15,18),shape('locked',40,40,8,8,true)]);
    const ids=['a1','a2','locked'];
    next=setElementsPositionAxis(next,'a',ids,'X',7);
    next=setElementsPositionAxis(next,'a',ids,'Y',9);
    next=setElementsSizeDimension(next,'a',ids,'WIDTH',22);
    next=setElementsSizeDimension(next,'a',ids,'HEIGHT',14);
    next=setElementsRotation(next,'a',ids,45);
    const [one,two,locked]=next.artboards[0]!.elements;
    expect(one).toMatchObject({position:{xMm:7,yMm:9},size:{widthMm:22,heightMm:14},rotationDeg:45});
    expect(two).toMatchObject({position:{xMm:7,yMm:9},size:{widthMm:22,heightMm:14},rotationDeg:45});
    expect(locked).toMatchObject({position:{xMm:40,yMm:40},size:{widthMm:8,heightMm:8},rotationDeg:0});
  });
});
