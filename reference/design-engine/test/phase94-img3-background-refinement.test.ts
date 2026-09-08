import { describe,it,expect } from 'vitest';
import { runImageBackgroundRemovalPipeline } from '../src/imageBackgroundRemoval.js';

function image(width:number,height:number,pixel:(x:number,y:number)=>[number,number,number,number]){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=pixel(x,y),i=(y*width+x)*4;
    data.set(p,i);
  }
  return {width,height,data};
}

describe('Phase 9.4 IMG3 background refinement + brush tools',()=>{
  it('feathers and softens the post-removal edge while keeping the center intact',()=>{
    const source=image(5,5,(x,y)=>{
      if(x===0||y===0||x===4||y===4)return [255,255,255,255];
      return [30,140,60,255];
    });
    const result=runImageBackgroundRemovalPipeline(source,{mode:'AUTO',tolerance:15,edgeSoftness:70,feather:80});
    const nearEdgeAlpha=result.image.data[(1*5+1)*4+3] ?? 0;
    const centerAlpha=result.image.data[(2*5+2)*4+3] ?? 0;
    expect(nearEdgeAlpha).toBeGreaterThan(0);
    expect(nearEdgeAlpha).toBeLessThan(255);
    expect(centerAlpha).toBeGreaterThanOrEqual(nearEdgeAlpha);
  });

  it('cleans white fringe colors toward neighboring subject colors',()=>{
    const source=image(5,5,(x,y)=>{
      if(x===0||y===0||x===4||y===4)return [255,255,255,255];
      if(x===1||y===1||x===3||y===3)return [235,245,235,255];
      return [20,120,40,255];
    });
    const withoutCleanup=runImageBackgroundRemovalPipeline(source,{mode:'AUTO',tolerance:15,edgeSoftness:50,feather:50,fringeCleanup:0});
    const withCleanup=runImageBackgroundRemovalPipeline(source,{mode:'AUTO',tolerance:15,edgeSoftness:50,feather:50,fringeCleanup:100});
    const edgeIndex=(1*5+1)*4;
    expect((withCleanup.image.data[edgeIndex] ?? 0)).toBeLessThan(withoutCleanup.image.data[edgeIndex] ?? 0);
    expect((withCleanup.image.data[edgeIndex+1] ?? 0)).toBeLessThanOrEqual(withoutCleanup.image.data[edgeIndex+1] ?? 0);
  });

  it('supports manual erase and restore brush edits',()=>{
    const source=image(7,7,()=>[180,30,30,255]);
    const erased=runImageBackgroundRemovalPipeline(source,{mode:'COLOR',tolerance:0,backgroundColor:{r:255,g:255,b:255},brushEdits:[{mode:'ERASE',x:0.5,y:0.5,radius:0.24,softness:0}]});
    const restored=runImageBackgroundRemovalPipeline(source,{mode:'COLOR',tolerance:0,backgroundColor:{r:255,g:255,b:255},brushEdits:[{mode:'ERASE',x:0.5,y:0.5,radius:0.24,softness:0},{mode:'RESTORE',x:0.5,y:0.5,radius:0.24,softness:0}]});
    const centerAlphaAfterErase=erased.image.data[(3*7+3)*4+3] ?? 0;
    const centerAlphaAfterRestore=restored.image.data[(3*7+3)*4+3] ?? 0;
    expect(centerAlphaAfterErase).toBe(0);
    expect(centerAlphaAfterRestore).toBeGreaterThan(centerAlphaAfterErase);
    expect(centerAlphaAfterRestore).toBe(255);
  });

  it('noise cleanup removes isolated opaque specks',()=>{
    const source=image(5,5,(x,y)=>x===2&&y===2?[20,20,20,255]:[255,255,255,255]);
    const result=runImageBackgroundRemovalPipeline(source,{mode:'AUTO',tolerance:15,noiseCleanup:100});
    expect(result.image.data[(2*5+2)*4+3]).toBe(0);
  });
});

it('creates a gradual alpha fade for off-white/color-contaminated edge pixels',()=>{
  const source=image(7,7,(x,y)=>{
    if(x===0||y===0||x===6||y===6)return [255,255,255,255];
    if(x===1||y===1||x===5||y===5)return [232,238,234,255];
    return [30,110,50,255];
  });
  const hard=runImageBackgroundRemovalPipeline(source,{mode:'AUTO',tolerance:5,edgeSoftness:0,feather:0});
  const soft=runImageBackgroundRemovalPipeline(source,{mode:'AUTO',tolerance:5,edgeSoftness:75,feather:20,fringeCleanup:70});
  const edge=(1*7+1)*4+3;
  expect(hard.image.data[edge]).toBe(255);
  expect(soft.image.data[edge]).toBeGreaterThan(0);
  expect(soft.image.data[edge]).toBeLessThan(255);
});
