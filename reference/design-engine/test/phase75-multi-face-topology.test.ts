import { describe, expect, it } from 'vitest';
import type { PathDesignElement } from '@document-tool/contracts';
import { createShapeElement, replaceElementsAtLayer, splitClosedElementByDivider, splitComponentFaceByDivider } from '../src/index.js';

function divider(id:string,a:{x:number;y:number},b:{x:number;y:number}):PathDesignElement {
  const minX=Math.min(a.x,b.x),minY=Math.min(a.y,b.y);
  const p1=`${id}-a`,p2=`${id}-b`;
  return {
    id,type:'PATH',name:id,position:{xMm:minX,yMm:minY},size:{widthMm:Math.max(.1,Math.abs(b.x-a.x)),heightMm:Math.max(.1,Math.abs(b.y-a.y))},
    rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:10,
    geometry:{points:[{id:p1,x:a.x-minX,y:a.y-minY,mode:'CORNER'},{id:p2,x:b.x-minX,y:b.y-minY,mode:'CORNER'}],segments:[{id:`${id}-seg`,type:'LINE',fromPointId:p1,toPointId:p2}],closed:false},
    fill:{type:'NONE'},stroke:{style:'SOLID',color:'#000000',widthMm:.5}
  };
}

const source=()=>createShapeElement('RECTANGLE',{id:'rect',name:'Rectangle',xMm:10,yMm:10,widthMm:40,heightMm:30,zIndex:3});

describe('Phase 7.5 incremental multi-section topology',()=>{

  it('splits a rounded rectangle on a strict boundary-to-boundary divider without relying on Paper endpoint intersections',()=>{
    const rounded=createShapeElement('ROUNDED_RECTANGLE',{id:'rounded',name:'Rounded Rectangle',xMm:10,yMm:10,widthMm:60,heightMm:24,zIndex:2});
    const cut=divider('rounded-cut',{x:40,y:10},{x:40,y:34});
    const faces=splitClosedElementByDivider(rounded,cut,'rounded-component');
    expect(faces).toHaveLength(2);
    expect(faces?.every(face=>face.groupId==='rounded-component')).toBe(true);
    expect(faces?.every(face=>face.geometry.closed)).toBe(true);
  });

  it('splits a generated face again when a divider starts on an existing shared divider',()=>{
    const first=divider('divider-1',{x:30,y:10},{x:30,y:40});
    const faces=splitClosedElementByDivider(source(),first,'component')!;
    expect(faces).toHaveLength(2);

    // Starts on the first divider and ends on the outer top/right region boundary.
    const second=divider('divider-2',{x:30,y:25},{x:50,y:10});
    const split=splitComponentFaceByDivider(faces,second,'component',faces.map(face=>face.id));
    expect(split).toBeDefined();
    expect(split?.componentId).toBe('component');
    expect(split?.faces).toHaveLength(2);
    expect(split?.faces.every(face=>face.geometry.closed)).toBe(true);
    expect(split?.faces.every(face=>face.metadata?.faceGeneration==='AUTO_SECTION')).toBe(true);
    expect(split?.faces.every(face=>face.groupId==='component')).toBe(true);
  });

  it('preserves unaffected faces so a second split yields three component sections',()=>{
    const first=divider('divider-1',{x:30,y:10},{x:30,y:40});
    const faces=splitClosedElementByDivider(source(),first,'component')!;
    const second=divider('divider-2',{x:30,y:25},{x:50,y:10});
    const split=splitComponentFaceByDivider(faces,second,'component',faces.map(face=>face.id))!;
    const resulting=[...faces.filter(face=>face.id!==split.sourceId),...split.faces];
    expect(resulting).toHaveLength(3);
    expect(new Set(resulting.map(face=>face.id)).size).toBe(3);
    expect(resulting.every(face=>face.groupId==='component')).toBe(true);
  });

  it('retains divider lineage metadata for future topology edits',()=>{
    const first=divider('divider-1',{x:30,y:10},{x:30,y:40});
    const faces=splitClosedElementByDivider(source(),first,'component')!;
    const second=divider('divider-2',{x:30,y:25},{x:50,y:10});
    const split=splitComponentFaceByDivider(faces,second,'component',faces.map(face=>face.id))!;
    for(const face of split.faces){
      expect(face.metadata?.faceDividerIds).toEqual(expect.arrayContaining(['divider-1','divider-2']));
      expect(face.metadata?.faceTopologyVersion).toBe(1);
    }
  });

  it('does not split when no current closed face is bounded by both divider endpoints',()=>{
    const first=divider('divider-1',{x:30,y:10},{x:30,y:40});
    const faces=splitClosedElementByDivider(source(),first,'component')!;
    const invalid=divider('outside',{x:5,y:5},{x:55,y:5});
    expect(splitComponentFaceByDivider(faces,invalid,'component')).toBeUndefined();
  });

  it('matches the screenshot acceptance case: a diagonal divider replaces the original rounded shape with exactly two closed faces',()=>{
    const rounded=createShapeElement('ROUNDED_RECTANGLE',{id:'rounded-diagonal',name:'Rounded Rectangle',xMm:10,yMm:10,widthMm:100,heightMm:20,zIndex:1});
    const cut=divider('diagonal-cut',{x:35,y:30},{x:45,y:10});
    const split=splitComponentFaceByDivider([rounded,cut],cut,'rounded-diagonal-component',['rounded-diagonal']);
    expect(split?.faces).toHaveLength(2);
    expect(split?.sourceId).toBe('rounded-diagonal');
    expect(split?.faces.every(face=>face.geometry.closed)).toBe(true);
    expect(split?.faces.every(face=>face.groupId==='rounded-diagonal-component')).toBe(true);

    const template:any={id:'template',name:'Template',version:1,artboards:[{id:'artboard',name:'Artboard',role:'GENERIC',widthMm:120,heightMm:40,displayUnit:'MM',background:{type:'SOLID',color:'#ffffff',opacity:1},elements:[rounded,cut],groups:[],guides:[],print:{}}],sharedAssets:[]};
    const replaced=replaceElementsAtLayer(template,'artboard',[rounded.id,cut.id],split!.faces);
    const resulting=replaced.artboards[0]!.elements;
    expect(resulting).toHaveLength(2);
    expect(resulting.some((element:any)=>element.id===rounded.id)).toBe(false);
    expect(resulting.some((element:any)=>element.id===cut.id)).toBe(false);
    expect(resulting.every((element:any)=>element.type==='PATH'&&element.geometry.closed)).toBe(true);
  });
});
