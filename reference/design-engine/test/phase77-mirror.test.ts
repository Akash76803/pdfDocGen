import { describe, expect, it } from 'vitest';
import type { DesignTemplate } from '@document-tool/contracts';
import { createShapeElement } from '../src/elements.js';
import { mirrorElementsAcrossArtboard } from '../src/mirror.js';

function template(widthMm=100):DesignTemplate{
  const shape=createShapeElement('ARROW',{id:'a',xMm:10,yMm:10,widthMm:20,heightMm:10,zIndex:1});
  return {id:'t',name:'T',status:'DRAFT',schemaVersion:1,createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString(),sharedAssets:[],artboards:[{id:'ab',name:'A',widthMm,heightMm:60,displayUnit:'MM',background:{type:'SOLID',color:'#fff',opacity:1},elements:[shape],groups:[],guides:[],print:{}}]} as unknown as DesignTemplate;
}

describe('Phase 7.7 page-center mirror',()=>{
  it('mirrors a copy across the current vertical page center',()=>{
    const result=mirrorElementsAcrossArtboard(template(100),'ab',['a'],'VERTICAL');
    const elements=result.artboards[0]!.elements;
    expect(elements).toHaveLength(2);
    expect(elements[0]!.position.xMm).toBe(10);
    expect(elements[1]!.position.xMm).toBe(70);
    expect(elements[1]!.id).not.toBe('a');
    expect(elements[1]!.type).toBe('SHAPE');
    if(elements[1]!.type==='SHAPE')expect(elements[1]!.flipX).toBe(true);
  });
  it('uses the current artboard width instead of a cached axis',()=>{
    const result=mirrorElementsAcrossArtboard(template(120),'ab',['a'],'VERTICAL');
    expect(result.artboards[0]!.elements[1]!.position.xMm).toBe(90);
  });
});
