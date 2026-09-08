import { describe,expect,it } from 'vitest';
import type { DesignTemplate } from '@document-tool/contracts';
import { createBlankArtboard,createShapeElement,addDesignElement,moveLayer,orderedLayers,groupElements,ungroupElements,expandElementIdsToGroups,setGroupLocked,setGroupVisibility,duplicateDesignElements,scaleElements,rotateElementsAsGroup } from '../src/index.js';

function base():DesignTemplate{
 let t:DesignTemplate={kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'T',version:1,status:'DRAFT',sharedAssets:[],artboards:[createBlankArtboard({id:'a',name:'Front',order:0,widthMm:90,heightMm:50})]};
 t=addDesignElement(t,'a',createShapeElement('RECTANGLE',{id:'one',xMm:10,yMm:10,widthMm:10,heightMm:10,zIndex:0}));
 t=addDesignElement(t,'a',createShapeElement('RECTANGLE',{id:'two',xMm:30,yMm:10,widthMm:10,heightMm:10,zIndex:1}));
 t=addDesignElement(t,'a',createShapeElement('RECTANGLE',{id:'three',xMm:50,yMm:10,widthMm:10,heightMm:10,zIndex:2}));
 return t;
}
describe('Phase 6.0.5 layers, z-order and grouping',()=>{
 it('moves layers deterministically to front/back and one step',()=>{let t=base();t=moveLayer(t,'a','one','FRONT');expect(orderedLayers(t.artboards[0]!).map(e=>e.id)).toEqual(['one','three','two']);t=moveLayer(t,'a','one','BACKWARD');expect(orderedLayers(t.artboards[0]!).map(e=>e.id)).toEqual(['three','one','two']);t=moveLayer(t,'a','three','BACK');expect(orderedLayers(t.artboards[0]!).at(-1)?.id).toBe('three');});
 it('creates a flat group and expands member selection to the whole group',()=>{const t=groupElements(base(),'a',['one','two'],'g1','Pair');const a=t.artboards[0]!;expect(a.groups[0]).toMatchObject({id:'g1',elementIds:['one','two']});expect(expandElementIdsToGroups(a,['one']).sort()).toEqual(['one','two']);});
 it('does not create nested groups in v1',()=>{let t=groupElements(base(),'a',['one','two'],'g1');t=groupElements(t,'a',['one','three'],'g2');expect(t.artboards[0]!.groups).toHaveLength(1);expect(t.artboards[0]!.elements.find(e=>e.id==='three')?.groupId).toBeUndefined();});
 it('ungroups without losing elements',()=>{let t=groupElements(base(),'a',['one','two'],'g1');t=ungroupElements(t,'a','g1');expect(t.artboards[0]!.groups).toHaveLength(0);expect(t.artboards[0]!.elements.every(e=>!e.groupId)).toBe(true);});
 it('locks and hides an entire group consistently',()=>{let t=groupElements(base(),'a',['one','two'],'g1');t=setGroupLocked(t,'a','g1',true);expect(t.artboards[0]!.elements.filter(e=>e.groupId==='g1').every(e=>e.locked)).toBe(true);t=setGroupVisibility(t,'a','g1',false);expect(t.artboards[0]!.elements.filter(e=>e.groupId==='g1').every(e=>!e.visible)).toBe(true);});
 it('duplicates grouped elements with independent ids and a copied group',()=>{let seq=0;const t=groupElements(base(),'a',['one','two'],'g1');const result=duplicateDesignElements(t,'a',['one','two'],()=>`copy-${++seq}`);expect(result.elementIds).toHaveLength(2);expect(result.template.artboards[0]!.groups).toHaveLength(2);expect(new Set(result.elementIds).size).toBe(2);});
 it('scales and rotates selected group members around shared bounds',()=>{let t=groupElements(base(),'a',['one','two'],'g1');t=scaleElements(t,'a',['one','two'],2);const a=t.artboards[0]!;expect(a.elements.find(e=>e.id==='one')?.size.widthMm).toBe(20);expect(a.elements.find(e=>e.id==='two')?.position.xMm).toBe(50);t=rotateElementsAsGroup(t,'a',['one','two'],90);expect(a.elements.length).toBe(3);expect(t.artboards[0]!.elements.find(e=>e.id==='one')?.rotationDeg).toBe(90);});
});
