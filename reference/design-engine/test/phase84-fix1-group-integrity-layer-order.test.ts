import { describe, expect, it } from 'vitest';
import type { DesignTemplate } from '@document-tool/contracts';
import {
  addDesignElement,
  createBlankArtboard,
  createShapeElement,
  deleteDesignElements,
  groupElements,
  moveLayers,
  orderedLayers,
  replaceElementsAtLayer,
  serializeDesignTemplate,
  validateDesignTemplate,
} from '../src/index.js';

function base(): DesignTemplate {
  let t: DesignTemplate = { kind:'CARD_DESIGN', schemaVersion:1, id:'t', name:'T', version:1, status:'DRAFT', sharedAssets:[], artboards:[createBlankArtboard({id:'a',name:'A',order:0,widthMm:100,heightMm:80})] };
  for (const [id,z] of [['one',0],['cover',1],['two',2],['front',3]] as const) {
    t=addDesignElement(t,'a',createShapeElement('RECTANGLE',{id,xMm:10,yMm:10,widthMm:20,heightMm:20,zIndex:z}));
  }
  return t;
}

describe('Phase 8.4 Fix1 group integrity and layer order',()=>{
  it('moves a grouped selection as one stable contiguous layer block',()=>{
    let t=groupElements(base(),'a',['one','two'],'g1','Pair');
    t=moveLayers(t,'a',['one','two'],'FORWARD');
    const ordered=orderedLayers(t.artboards[0]!).map(e=>e.id);
    expect(ordered).toEqual(['two','one','front','cover']);
    expect(Math.abs((t.artboards[0]!.elements.find(e=>e.id==='two')!.zIndex)-(t.artboards[0]!.elements.find(e=>e.id==='one')!.zIndex))).toBe(1);
  });

  it('removes stale group references when a grouped source is replaced',()=>{
    let t=groupElements(base(),'a',['one','two'],'g1','Pair');
    const source=t.artboards[0]!.elements.find(e=>e.id==='one')!;
    const replacement={...source,id:'replacement',name:'Replacement',groupId:source.groupId};
    t=replaceElementsAtLayer(t,'a',['one'],[replacement]);
    const group=t.artboards[0]!.groups.find(g=>g.id==='g1');
    expect(group).toBeUndefined();
    expect(t.artboards[0]!.elements.find(e=>e.id==='two')?.groupId).toBeUndefined();
    expect(t.artboards[0]!.elements.find(e=>e.id==='replacement')?.groupId).toBeUndefined();
    expect(validateDesignTemplate(t).valid).toBe(true);
    expect(()=>serializeDesignTemplate(t)).not.toThrow();
  });

  it('deletes only unlocked requested members and keeps group metadata valid',()=>{
    let t=groupElements(base(),'a',['one','two'],'g1','Pair');
    t={...t,artboards:t.artboards.map(a=>a.id==='a'?{...a,elements:a.elements.map(e=>e.id==='two'?{...e,locked:true}:e)}:a)};
    t=deleteDesignElements(t,'a',['one','two']);
    expect(t.artboards[0]!.elements.some(e=>e.id==='one')).toBe(false);
    expect(t.artboards[0]!.elements.some(e=>e.id==='two')).toBe(true);
    expect(t.artboards[0]!.groups.some(g=>g.id==='g1')).toBe(false);
    expect(t.artboards[0]!.elements.find(e=>e.id==='two')?.groupId).toBeUndefined();
    expect(validateDesignTemplate(t).valid).toBe(true);
  });

  it('defensively repairs an already-stale group before serialization',()=>{
    let t=groupElements(base(),'a',['one','two'],'g1','Pair');
    t={...t,artboards:t.artboards.map(a=>a.id==='a'?{...a,elements:a.elements.filter(e=>e.id!=='one')}:a)};
    expect(validateDesignTemplate(t).valid).toBe(false);
    const serialized=serializeDesignTemplate(t);
    const parsed=JSON.parse(serialized) as DesignTemplate;
    expect(parsed.artboards[0]!.groups.some(g=>g.id==='g1')).toBe(false);
    expect(parsed.artboards[0]!.elements.find(e=>e.id==='two')?.groupId).toBeUndefined();
  });
});
