import {describe,it,expect} from 'vitest';
import type {PathDesignElement,ShapeDesignElement} from '@document-tool/contracts';
import {materializeSharedJunctions,getSharedJunctionId,moveSharedJunction,findSharedJunctionAtWorld,detachSharedJunction} from '../src/sharedJunctionTopology.js';

const stroke={style:'SOLID' as const,color:'#000',widthMm:.5,opacity:1};
const fill={type:'NONE' as const};
const circle=(id:string,x:number):ShapeDesignElement=>({id,type:'SHAPE',name:id,shape:'CIRCLE',position:{xMm:x,yMm:0},size:{widthMm:20,heightMm:20},rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:1,fill,stroke});

describe('VECTOR-UX2 Fix14 shared trim junction topology',()=>{
 it('converts touched shapes to PATH and assigns the same junction id',()=>{
  const result=materializeSharedJunctions([circle('a',0),circle('b',10)], [{x:15,y:5,id:'J1'}], 1);
  const paths=result.filter((e):e is PathDesignElement=>e.type==='PATH');
  expect(paths.length).toBe(2);
  const ids=paths.flatMap(path=>path.geometry.points.map(point=>getSharedJunctionId(path,point.id)).filter(Boolean));
  expect(ids.filter(id=>id==='J1').length).toBe(2);
 });
 it('moves all participants of one shared junction together',()=>{
  const materialized=materializeSharedJunctions([circle('a',0),circle('b',10)], [{x:15,y:5,id:'J1'}], 1);
  const moved=moveSharedJunction(materialized,'J1',{x:16,y:6});
  const hit=findSharedJunctionAtWorld(moved,{x:16,y:6},.2);
  expect(hit?.participants.length).toBe(2);
 });
 it('Split detach keeps geometry but removes shared junction relationship',()=>{
  const materialized=materializeSharedJunctions([circle('a',0),circle('b',10)], [{x:15,y:5,id:'J1'}], 1);
  const detached=detachSharedJunction(materialized,'J1');
  expect(findSharedJunctionAtWorld(detached,{x:15,y:5},.2)).toBeUndefined();
 });
});
