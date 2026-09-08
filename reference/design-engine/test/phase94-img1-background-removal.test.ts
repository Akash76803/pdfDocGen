import { describe,it,expect } from 'vitest';
import { removeConnectedImageBackground, createBackgroundRemovedAsset, applyBackgroundRemovedAssetToImage, resetImageBackgroundRemoval } from '../src/imageBackgroundRemoval.js';
import { createBlankArtboard, createImageElement } from '../src/index.js';
import type { DesignTemplate } from '@document-tool/contracts';

function image(width:number,height:number,pixel:(x:number,y:number)=>[number,number,number,number]){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=pixel(x,y),i=(y*width+x)*4;data.set(p,i);}
  return {width,height,data};
}

describe('Phase 9.4 IMG1 connected background removal',()=>{
  it('removes white border background while preserving disconnected white foreground',()=>{
    const source=image(5,5,(x,y)=>{
      if(x===0||y===0||x===4||y===4)return [255,255,255,255];
      if(x===2&&y===2)return [255,255,255,255];
      return [20,120,40,255];
    });
    const result=removeConnectedImageBackground(source,{mode:'AUTO',tolerance:15});
    expect(result.image.data[3]).toBe(0);
    expect(result.image.data[(2*5+2)*4+3]).toBe(255);
    expect(result.removedPixels).toBe(16);
  });


  it('removes off-white border backgrounds with tolerance',()=>{
    const source=image(5,5,(x,y)=>(x===0||y===0||x===4||y===4)?[248,247,244,255]:[30,60,160,255]);
    const result=removeConnectedImageBackground(source,{mode:'AUTO',tolerance:12});
    expect(result.removedPixels).toBe(16);
    expect(result.image.data[(2*5+2)*4+3]).toBe(255);
  });

  it('does not destroy a nearly uniform image in auto mode',()=>{
    const source=image(4,4,()=>[120,120,120,255]);
    const result=removeConnectedImageBackground(source,{mode:'AUTO',tolerance:10});
    expect(result.removedPixels).toBe(0);
    expect(result.image.data[3]).toBe(255);
  });

  it('removes selected colored border background',()=>{
    const source=image(4,4,(x,y)=>(x===0||y===0||x===3||y===3)?[0,200,20,255]:[240,20,20,255]);
    const result=removeConnectedImageBackground(source,{mode:'COLOR',tolerance:5,backgroundColor:{r:0,g:200,b:20}});
    expect(result.removedPixels).toBe(12);
    expect(result.image.data[(1*4+1)*4+3]).toBe(255);
  });

  it('keeps existing transparent pixels valid',()=>{
    const source=image(3,3,(x,y)=>x===0&&y===0?[0,0,0,0]:[80,90,100,255]);
    const result=removeConnectedImageBackground(source,{mode:'COLOR',tolerance:0,backgroundColor:{r:255,g:255,b:255}});
    expect(result.image.data[3]).toBe(0);
    expect(result.image.data[(1*3+1)*4+3]).toBe(255);
  });

  it('applies a derived asset non-destructively, survives JSON persistence, and resets to original',()=>{
    const original={id:'asset-original',name:'Flower',kind:'IMAGE' as const,sourceType:'DATA_URL' as const,source:'data:image/png;base64,original',mimeType:'image/png',widthPx:100,heightPx:80};
    const artboard=createBlankArtboard({id:'a',name:'A',order:0,widthMm:90,heightMm:50});
    artboard.elements=[createImageElement(original.id,{id:'img'})];
    const template:DesignTemplate={kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'T',version:1,status:'DRAFT',artboards:[artboard],sharedAssets:[original]};
    const derived=createBackgroundRemovedAsset(original,'data:image/png;base64,derived',{mode:'AUTO',tolerance:28},'asset-derived','2026-01-01T00:00:00.000Z');
    const applied=applyBackgroundRemovedAssetToImage(template,'a','img',derived);
    expect(applied.sharedAssets).toHaveLength(2);
    expect((applied.artboards[0]!.elements[0] as any).assetId).toBe('asset-derived');
    expect(applied.sharedAssets[0]!.source).toBe(original.source);
    const persisted=JSON.parse(JSON.stringify(applied)) as DesignTemplate;
    expect((persisted.artboards[0]!.elements[0] as any).assetId).toBe('asset-derived');
    expect(persisted.sharedAssets.find(a=>a.id==='asset-derived')?.metadata?.backgroundRemovalOriginalAssetId).toBe('asset-original');
    const reset=resetImageBackgroundRemoval(persisted,'a','img');
    expect((reset.artboards[0]!.elements[0] as any).assetId).toBe('asset-original');
  });

});
