import { describe,it,expect } from 'vitest';
import {
  createBackgroundRemovedAsset,
  applyBackgroundRemovedAssetToImageFill,
  resetImageFillBackgroundRemoval,
  resolveRasterImageFillSource,
  applyBackgroundRemovedAssetToImage,
} from '../src/index.js';
import type { DesignTemplate, ShapeDesignElement, PathDesignElement } from '@document-tool/contracts';

const original={id:'asset-original',name:'Artwork',kind:'IMAGE' as const,sourceType:'DATA_URL' as const,source:'data:image/png;base64,ORIGINAL',mimeType:'image/png'};

function templateWith(element:ShapeDesignElement|PathDesignElement):DesignTemplate{
  return {kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'T',version:1,status:'DRAFT',sharedAssets:[original],artboards:[{id:'a',name:'A',order:0,widthMm:90,heightMm:50,background:{type:'SOLID',color:'#fff'},elements:[element],groups:[],guides:[],metadata:{}} as any]};
}

describe('Phase 9.4 IMG4 workflow integration',()=>{
  it.each([
    ['SHAPE',{id:'s',type:'SHAPE',name:'S',visible:true,locked:false,zIndex:1,position:{xMm:1,yMm:1},size:{widthMm:20,heightMm:20},rotationDeg:0,opacity:1,shape:'RECTANGLE',fill:{type:'IMAGE',assetId:'asset-original',fit:'FILL',opacity:1},stroke:{enabled:false,color:'#000',widthMm:0}} as any],
    ['PATH',{id:'p',type:'PATH',name:'P',visible:true,locked:false,zIndex:1,position:{xMm:1,yMm:1},size:{widthMm:20,heightMm:20},rotationDeg:0,opacity:1,geometry:{closed:true,points:[]},fill:{type:'IMAGE',assetId:'asset-original',fit:'FILL',opacity:1},stroke:{enabled:false,color:'#000',widthMm:0}} as any],
  ])('applies/removes a derived transparent asset on %s image fills',(_kind,element)=>{
    const source=templateWith(element);
    const derived=createBackgroundRemovedAsset(original,'data:image/png;base64,DERIVED',{mode:'AUTO',tolerance:25,edgeSoftness:50,feather:10},'asset-derived','2026-09-05T00:00:00.000Z');
    const applied=applyBackgroundRemovedAssetToImageFill(source,'a',element.id,derived);
    const appliedElement=applied.artboards[0]!.elements[0] as ShapeDesignElement|PathDesignElement;
    expect(appliedElement.fill.type).toBe('IMAGE');
    if(appliedElement.fill.type==='IMAGE'){
      expect(appliedElement.fill.assetId).toBe('asset-derived');
      expect(resolveRasterImageFillSource(appliedElement.fill,applied.sharedAssets)).toBe('data:image/png;base64,DERIVED');
    }
    const reset=resetImageFillBackgroundRemoval(JSON.parse(JSON.stringify(applied)),'a',element.id);
    const resetElement=reset.artboards[0]!.elements[0] as ShapeDesignElement|PathDesignElement;
    expect(resetElement.fill.type).toBe('IMAGE');
    if(resetElement.fill.type==='IMAGE')expect(resetElement.fill.assetId).toBe('asset-original');
  });

  it('preserves packaging ownership metadata when replacing an IMAGE asset',()=>{
    const imageElement:any={id:'img',type:'IMAGE',assetId:'asset-original',name:'Panel Art',visible:true,locked:false,zIndex:1,position:{xMm:0,yMm:0},size:{widthMm:20,heightMm:20},rotationDeg:0,opacity:1,fit:'FIT',metadata:{packagingPanelId:'FRONT'}};
    const source:DesignTemplate={kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'T',version:1,status:'DRAFT',sharedAssets:[original],artboards:[{id:'a',name:'A',order:0,widthMm:90,heightMm:50,background:{type:'SOLID',color:'#fff'},elements:[imageElement],groups:[],guides:[]} as any]};
    const derived=createBackgroundRemovedAsset(original,'data:image/png;base64,DERIVED',{mode:'AUTO',tolerance:25},'asset-derived');
    const applied=applyBackgroundRemovedAssetToImage(source,'a','img',derived);
    expect((applied.artboards[0]!.elements[0] as any).metadata.packagingPanelId).toBe('FRONT');
  });
});
