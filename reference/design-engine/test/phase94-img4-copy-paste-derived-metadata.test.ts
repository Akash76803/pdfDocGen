import { describe,it,expect } from 'vitest';
import { createDesignClipboardPayload,pasteDesignClipboard,duplicateDesignElements } from '../src/index.js';
import type { DesignTemplate } from '@document-tool/contracts';

function template():DesignTemplate{
  return {kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'T',version:1,status:'DRAFT',sharedAssets:[],artboards:[{id:'a',name:'A',order:0,widthMm:90,heightMm:50,displayUnit:'MM',background:{type:'NONE'},guides:[],groups:[],elements:[{id:'img',name:'Image',type:'IMAGE',position:{xMm:1,yMm:1},size:{widthMm:20,heightMm:20},rotationDeg:0,zIndex:0,visible:true,locked:false,opacity:1,assetId:'asset',fit:'FIT',metadata:{dynamicBackgroundRemoval:{enabled:true,settings:{mode:'AUTO',tolerance:28,edgeSoftness:50}}}}]}] as any};
}

describe('IMG4 derived/dynamic metadata copy behavior',()=>{
  it('copy/paste keeps dynamic background removal metadata',()=>{
    const source=template();
    const payload=createDesignClipboardPayload(source,'a',['img'])!;
    const pasted=pasteDesignClipboard(source,'a',payload,id=>`copy-${id}`);
    const copy=pasted.template.artboards[0]!.elements.find(e=>e.id==='copy-img')!;
    expect(copy.metadata?.dynamicBackgroundRemoval).toEqual(source.artboards[0]!.elements[0]!.metadata?.dynamicBackgroundRemoval);
  });

  it('duplicate keeps dynamic background removal metadata',()=>{
    const source=template();
    const duplicated=duplicateDesignElements(source,'a',['img'],id=>`dup-${id}`);
    const copy=duplicated.template.artboards[0]!.elements.find(e=>e.id==='dup-img')!;
    expect(copy.metadata?.dynamicBackgroundRemoval).toEqual(source.artboards[0]!.elements[0]!.metadata?.dynamicBackgroundRemoval);
  });
});
