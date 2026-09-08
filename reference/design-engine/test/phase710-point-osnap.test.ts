import {describe,expect,it} from 'vitest';
import type {Artboard,PathDesignElement} from '@document-tool/contracts';
import {createShapeElement,resolvePointSnap,splitClosedElementByDivider} from '../src/index.js';

function artboard(elements:Artboard['elements']):Artboard{
  return {id:'a',name:'A',order:0,widthMm:100,heightMm:100,displayUnit:'MM',background:{type:'SOLID',color:'#fff',opacity:1},print:{bleed:{topMm:0,rightMm:0,bottomMm:0,leftMm:0},safeArea:{topMm:0,rightMm:0,bottomMm:0,leftMm:0}},guides:[],groups:[],elements};
}
function line(id:string,ax:number,ay:number,bx:number,by:number):PathDesignElement{
  const p1=`${id}-a`,p2=`${id}-b`;
  return {id,type:'PATH',name:id,position:{xMm:0,yMm:0},size:{widthMm:Math.max(.1,Math.abs(bx-ax)),heightMm:Math.max(.1,Math.abs(by-ay))},rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:1,geometry:{points:[{id:p1,x:ax,y:ay,mode:'CORNER'},{id:p2,x:bx,y:by,mode:'CORNER'}],segments:[{id:`${id}-seg`,type:'LINE',fromPointId:p1,toPointId:p2}],closed:false},fill:{type:'NONE'},stroke:{style:'SOLID',color:'#000',widthMm:.5}};
}

describe('CAD point OSNAP',()=>{
  it('prioritizes existing line endpoints over nearby boundary candidates',()=>{
    const rect=createShapeElement('RECTANGLE',{id:'rect',xMm:10,yMm:10,widthMm:40,heightMm:30});
    const divider=line('divider',10,10,30,20);
    const snap=resolvePointSnap(artboard([rect,divider]),{x:10.3,y:10.2},{toleranceMm:1});
    expect(snap).toMatchObject({kind:'LINE_ENDPOINT',elementId:'divider',point:{x:10,y:10}});
  });

  it('projects to the exact nearest shape boundary',()=>{
    const rect=createShapeElement('RECTANGLE',{id:'rect',xMm:10,yMm:10,widthMm:40,heightMm:30});
    const snap=resolvePointSnap(artboard([rect]),{x:30,y:10.8},{toleranceMm:2});
    expect(snap).toMatchObject({kind:'BOUNDARY',point:{x:30,y:10}});
  });

  it('snaps an in-progress line endpoint to its exact intersection with existing geometry',()=>{
    const rect=createShapeElement('RECTANGLE',{id:'rect',xMm:20,yMm:20,widthMm:30,heightMm:30});
    const snap=resolvePointSnap(artboard([rect]),{x:50.6,y:35},{toleranceMm:1,lineStart:{x:25,y:35}});
    expect(snap?.kind).toBe('INTERSECTION');
    expect(snap?.point.x).toBeCloseTo(50,6);
    expect(snap?.point.y).toBeCloseTo(35,6);
  });

  it('uses guide before grid when both are within tolerance',()=>{
    const a=artboard([]);a.guides=[{id:'g',orientation:'VERTICAL',positionMm:21}];
    const snap=resolvePointSnap(a,{x:20.8,y:20.2},{toleranceMm:1,snapToGuides:true,snapToGrid:true,gridSizeMm:5});
    expect(snap).toMatchObject({kind:'GUIDE',guideId:'g',point:{x:21,y:20.2}});
  });


  it('commits coordinates precise enough for the unchanged 0.05mm face-split validation',()=>{
    const rect=createShapeElement('RECTANGLE',{id:'rect',xMm:10,yMm:10,widthMm:40,heightMm:30});
    const a=artboard([rect]);
    const start=resolvePointSnap(a,{x:10.7,y:25},{toleranceMm:1});
    expect(start?.point).toEqual({x:10,y:25});
    const end=resolvePointSnap(a,{x:49.4,y:25},{toleranceMm:1,lineStart:start?.point});
    expect(end?.point).toEqual({x:50,y:25});
    const divider=line('snapped-divider',start!.point.x,start!.point.y,end!.point.x,end!.point.y);
    const faces=splitClosedElementByDivider(rect,divider,'component');
    expect(faces).toHaveLength(2);
  });

  it('can exclude the path currently being node-edited',()=>{
    const own=line('own',10,10,20,10),other=line('other',30,30,40,30);
    const snap=resolvePointSnap(artboard([own,other]),{x:30.2,y:30.1},{toleranceMm:1,excludeIds:['own']});
    expect(snap).toMatchObject({kind:'LINE_ENDPOINT',elementId:'other',point:{x:30,y:30}});
  });
});
