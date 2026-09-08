import {describe,expect,it} from 'vitest';
import {createBlankArtboard} from '../src/artboards.js';

describe('VECTOR-UX2 Fix3 page border metadata',()=>{
 it('new artboards can inherit editor default when pageBorder metadata is absent',()=>{
  const a=createBlankArtboard({id:'a',name:'A',order:0,widthMm:100,heightMm:50});
  expect(a.metadata?.pageBorder).toBeUndefined();
 });
 it('page border settings survive ordinary artboard cloning data shape',()=>{
  const a=createBlankArtboard({id:'a',name:'A',order:0,widthMm:100,heightMm:50});
  a.metadata={pageBorder:{enabled:true,color:'#112233',widthPx:2,style:'DASHED',position:'INSIDE',exportEnabled:true}};
  const b=structuredClone(a);
  expect((b.metadata?.pageBorder as any).exportEnabled).toBe(true);
  expect((b.metadata?.pageBorder as any).style).toBe('DASHED');
 });
});
