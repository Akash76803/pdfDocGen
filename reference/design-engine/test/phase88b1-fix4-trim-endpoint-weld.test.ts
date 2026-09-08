import {describe,expect,it} from 'vitest';
import type {PathDesignElement} from '@document-tool/contracts';
import {localToWorld,weldPathEndpointsToNearbyNodes} from '../src/index.js';

function line(id:string,ax:number,ay:number,bx:number,by:number):PathDesignElement{const a=`${id}-a`,b=`${id}-b`;return{id,type:'PATH',name:id,position:{xMm:0,yMm:0},size:{widthMm:Math.max(.1,Math.abs(bx-ax)),heightMm:Math.max(.1,Math.abs(by-ay))},rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:1,geometry:{points:[{id:a,x:ax,y:ay,mode:'CORNER'},{id:b,x:bx,y:by,mode:'CORNER'}],segments:[{id:`${id}-s`,type:'LINE',fromPointId:a,toPointId:b}],closed:false},fill:{type:'NONE'},stroke:{style:'SOLID',color:'#000',widthMm:.5}};}
function endpointWorld(element:PathDesignElement,pointId:string){const point=element.geometry.points.find(item=>item.id===pointId)!;return localToWorld(point,element);}

describe('post-trim endpoint welding',()=>{
 it('welds two or more generated fragment endpoints onto one canonical existing node',()=>{const anchor=line('anchor',10,10,20,10),a=line('a',0,0,10.08,10.04),b=line('b',10.1,9.95,5,20),c=line('c',10.02,10.09,20,20);const result=weldPathEndpointsToNearbyNodes([anchor,a,b,c],['a','b','c']);for(const id of ['a','b','c']){const element=result.find(item=>item.id===id) as PathDesignElement;const near=element.geometry.points.map(point=>({point,world:localToWorld(point,element)})).sort((x,y)=>Math.hypot(x.world.x-10,x.world.y-10)-Math.hypot(y.world.x-10,y.world.y-10))[0]!;expect(near.world.x).toBe(10);expect(near.world.y).toBe(10);}expect(endpointWorld(result[0] as PathDesignElement,'anchor-a')).toEqual({x:10,y:10});});
 it('does not weld beyond the guarded tolerance',()=>{const anchor=line('anchor',10,10,20,10),target=line('target',0,0,10.3,10);const result=weldPathEndpointsToNearbyNodes([anchor,target],['target']);expect(endpointWorld(result[1] as PathDesignElement,'target-b').x).toBeCloseTo(10.3,8);});
});
