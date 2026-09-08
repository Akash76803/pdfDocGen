import {describe,expect,it} from 'vitest';
import type {DesignElement,DesignTemplate} from '@document-tool/contracts';
import {addDesignElement,createBlankArtboard,createShapeElement,moveLayer,moveLayers,orderedLayers,replaceElementsAtLayer} from '../src/index.js';

function base():DesignTemplate{
 let template:DesignTemplate={kind:'CARD_DESIGN',schemaVersion:1,id:'phase73',name:'Layer regression',version:1,status:'DRAFT',sharedAssets:[],artboards:[createBlankArtboard({id:'a',name:'Front',order:0,widthMm:90,heightMm:50})]};
 for(const [index,id] of ['back','middle-a','middle-b','front'].entries())template=addDesignElement(template,'a',createShapeElement('RECTANGLE',{id,xMm:10,yMm:10,widthMm:30,heightMm:30,zIndex:index}));
 return template;
}
const frontToBack=(template:DesignTemplate)=>orderedLayers(template.artboards[0]!).map(element=>element.id);

describe('Phase 7.3 canonical layer order regression',()=>{
 it('supports all four single-element commands without changing geometry',()=>{const original=base(),position=original.artboards[0]!.elements[0]!.position;let template=moveLayer(original,'a','back','FORWARD');expect(frontToBack(template)).toEqual(['front','middle-b','back','middle-a']);template=moveLayer(template,'a','back','FRONT');expect(frontToBack(template)[0]).toBe('back');template=moveLayer(template,'a','back','BACKWARD');expect(frontToBack(template)[1]).toBe('back');template=moveLayer(template,'a','back','BACK');expect(frontToBack(template).at(-1)).toBe('back');expect(template.artboards[0]!.elements.find(element=>element.id==='back')?.position).toEqual(position);});
 it('moves a multi-selection as stable relative layers',()=>{let template=moveLayers(base(),'a',['middle-a','middle-b'],'FRONT');expect(frontToBack(template)).toEqual(['middle-b','middle-a','front','back']);template=moveLayers(template,'a',['middle-a','middle-b'],'BACK');expect(frontToBack(template)).toEqual(['front','back','middle-b','middle-a']);});
 it('keeps replacement fragments adjacent at the source stacking region',()=>{const template=base(),source=template.artboards[0]!.elements.find(element=>element.id==='middle-a')!;const fragments=['fragment-a','fragment-b'].map((id,index)=>({...source,id,name:id,zIndex:source.zIndex+index})) as DesignElement[];const replaced=replaceElementsAtLayer(template,'a',['middle-a'],fragments);expect(frontToBack(replaced)).toEqual(['front','middle-b','fragment-b','fragment-a','back']);expect(replaced.artboards[0]!.elements.map(element=>element.zIndex).sort((a,b)=>a-b)).toEqual([0,1,2,3,4]);});
 it('places a combined result at the topmost selected source layer',()=>{const template=base(),result={...template.artboards[0]!.elements[1]!,id:'combined'};expect(frontToBack(replaceElementsAtLayer(template,'a',['back','middle-b'],[result]))).toEqual(['front','combined','middle-a']);});
});
