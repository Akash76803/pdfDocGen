import { describe, expect, it } from 'vitest';
import type { DesignTemplate } from '@document-tool/contracts';
import { addDesignElement, createBlankArtboard, createShapeElement, groupElements, moveLayers, orderedLayers } from '../src/index.js';

function base(): DesignTemplate {
  let template: DesignTemplate = { kind:'CARD_DESIGN', schemaVersion:1, id:'t', name:'T', version:1, status:'DRAFT', sharedAssets:[], artboards:[createBlankArtboard({id:'a',name:'A',order:0,widthMm:100,heightMm:80})] };
  for (const [id,z] of [['square',0],['diamond',1],['triangle',2],['front',3]] as const) {
    template=addDesignElement(template,'a',createShapeElement('RECTANGLE',{id,name:id,xMm:10,yMm:10,widthMm:20,heightMm:20,zIndex:z}));
  }
  return template;
}

describe('Phase 8.4 Fix2 hierarchical layer semantics',()=>{
  it('compacts newly grouped members into one contiguous z-order block at the front-most selected slot',()=>{
    const template=groupElements(base(),'a',['square','triangle'],'g1','Group 1');
    expect(orderedLayers(template.artboards[0]!).map(element=>element.id)).toEqual(['front','triangle','square','diamond']);
    const group=template.artboards[0]!.groups.find(item=>item.id==='g1')!;
    expect(group.elementIds).toEqual(['square','triangle']);
    const z=group.elementIds.map(id=>template.artboards[0]!.elements.find(element=>element.id===id)!.zIndex).sort((a,b)=>a-b);
    expect(z[1]-z[0]).toBe(1);
  });

  it('moves even a legacy interleaved group one atomic step and compacts its members',()=>{
    let template=base();
    template={...template,artboards:template.artboards.map(artboard=>artboard.id==='a'?{
      ...artboard,
      groups:[{id:'g1',name:'Legacy Group',elementIds:['square','triangle'],visible:true,locked:false}],
      elements:artboard.elements.map(element=>['square','triangle'].includes(element.id)?{...element,groupId:'g1'}:element),
    }:artboard)};
    template=moveLayers(template,'a',['square','triangle'],'BACKWARD');
    expect(orderedLayers(template.artboards[0]!).map(element=>element.id)).toEqual(['front','diamond','triangle','square']);
    const square=template.artboards[0]!.elements.find(element=>element.id==='square')!;
    const triangle=template.artboards[0]!.elements.find(element=>element.id==='triangle')!;
    expect(Math.abs(triangle.zIndex-square.zIndex)).toBe(1);
  });
});
