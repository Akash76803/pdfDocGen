import { describe, expect, it } from 'vitest';
import type { DesignElement, DesignTemplate, PathDesignElement } from '@document-tool/contracts';
import {
  createBlankArtboard, createShapeElement, groupElements, renameGroup, restoreGroups, ungroupElements,
  scaleElements, flipElementsAsGroup, matchAlignmentUnitsSize, duplicateDesignElements, setGroupLocked, setGroupVisibility
} from '../src/index.js';

const path=(id:string,x:number):PathDesignElement=>({
  id,type:'PATH',name:id,position:{xMm:x,yMm:10},size:{widthMm:10,heightMm:10},rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:1,
  geometry:{points:[{id:`${id}-p1`,x:0,y:0,mode:'CORNER'},{id:`${id}-p2`,x:10,y:10,mode:'CORNER',inHandle:{x:8,y:8},outHandle:{x:9,y:9}}],segments:[{id:`${id}-s`,type:'LINE',fromPointId:`${id}-p1`,toPointId:`${id}-p2`}],closed:false},
  fill:{type:'NONE'},stroke:{style:'SOLID',color:'#111111',widthMm:.4}
});
const template=(elements:DesignElement[]):DesignTemplate=>({kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'T',version:1,status:'DRAFT',sharedAssets:[],artboards:[{...createBlankArtboard({id:'a',name:'A',order:0,widthMm:120,heightMm:80}),elements}]});

function grouped():DesignTemplate{
  const a=createShapeElement('RECTANGLE',{id:'one',xMm:10,yMm:10,widthMm:10,heightMm:10,zIndex:0});
  const p=path('path',30);
  return groupElements(template([a,p]),'a',['one','path'],'g1','Artwork');
}

describe('Phase 8.4 group hardening',()=>{
  it('scales PATH child geometry and handles with the group bounds',()=>{
    const next=scaleElements(grouped(),'a',['one','path'],2);
    const p=next.artboards[0]!.elements.find(e=>e.id==='path') as PathDesignElement;
    expect(p.size).toEqual({widthMm:20,heightMm:20});
    expect(p.position.xMm).toBe(50);
    expect(p.geometry.points[1]).toMatchObject({x:20,y:20,inHandle:{x:16,y:16},outHandle:{x:18,y:18}});
  });

  it('restores the previous flat group only when all members still exist and are ungrouped',()=>{
    let next=ungroupElements(grouped(),'a','g1');
    next=restoreGroups(next,'a',[{id:'g1',name:'Artwork',elementIds:['one','path'],visible:true,locked:false}]);
    expect(next.artboards[0]!.groups.find(g=>g.id==='g1')?.elementIds).toEqual(['one','path']);
    expect(next.artboards[0]!.elements.filter(e=>e.groupId==='g1')).toHaveLength(2);

    const ungrouped=ungroupElements(next,'a','g1');
    const missing={...ungrouped,artboards:[{...ungrouped.artboards[0]!,elements:ungrouped.artboards[0]!.elements.filter(e=>e.id!=='path')}]} as DesignTemplate;
    expect(restoreGroups(missing,'a',[{id:'g1',name:'Artwork',elementIds:['one','path'],visible:true,locked:false}]).artboards[0]!.groups).toHaveLength(0);
  });

  it('renames a group without changing child ids or geometry',()=>{
    const before=grouped();
    const next=renameGroup(before,'a','g1','Logo Lockup');
    expect(next.artboards[0]!.groups[0]?.name).toBe('Logo Lockup');
    expect(next.artboards[0]!.elements.map(e=>e.id)).toEqual(before.artboards[0]!.elements.map(e=>e.id));
  });

  it('flips a group around shared bounds instead of flipping each child in place',()=>{
    const next=flipElementsAsGroup(grouped(),'a',['one','path'],'VERTICAL');
    const one=next.artboards[0]!.elements.find(e=>e.id==='one')!;
    const p=next.artboards[0]!.elements.find(e=>e.id==='path') as PathDesignElement;
    expect(one.position.xMm).toBe(30);
    expect(p.position.xMm).toBe(10);
    expect(p.geometry.points[0]?.x).toBe(10);
    expect(p.geometry.points[1]?.x).toBe(0);
  });

  it('matches whole group dimensions to a primary element atomically',()=>{
    const primary=createShapeElement('RECTANGLE',{id:'primary',xMm:70,yMm:10,widthMm:60,heightMm:30,zIndex:3});
    let next=grouped();
    next={...next,artboards:next.artboards.map(a=>({...a,elements:[...a.elements,primary]}))};
    next=matchAlignmentUnitsSize(next,'a',['one','path','primary'],'primary','BOTH');
    const members=next.artboards[0]!.elements.filter(e=>e.groupId==='g1');
    const minX=Math.min(...members.map(e=>e.position.xMm)),maxX=Math.max(...members.map(e=>e.position.xMm+e.size.widthMm));
    const minY=Math.min(...members.map(e=>e.position.yMm)),maxY=Math.max(...members.map(e=>e.position.yMm+e.size.heightMm));
    expect(maxX-minX).toBeCloseTo(60);
    expect(maxY-minY).toBeCloseTo(30);
  });

  it('keeps duplicate, lock and visibility operations group-consistent',()=>{
    let next=grouped();
    let seq=0;
    const dup=duplicateDesignElements(next,'a',['one','path'],()=>`copy-${++seq}`);
    expect(dup.template.artboards[0]!.groups).toHaveLength(2);
    const copiedGroup=dup.template.artboards[0]!.groups.find(g=>g.id!=='g1')!;
    expect(copiedGroup.elementIds).toHaveLength(2);
    next=setGroupLocked(dup.template,'a','g1',true);
    expect(next.artboards[0]!.elements.filter(e=>e.groupId==='g1').every(e=>e.locked)).toBe(true);
    next=setGroupVisibility(next,'a','g1',false);
    expect(next.artboards[0]!.elements.filter(e=>e.groupId==='g1').every(e=>!e.visible)).toBe(true);
  });
});
