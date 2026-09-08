import {describe,expect,it} from 'vitest';
import type {DesignTemplate} from '@document-tool/contracts';
import {addArtboard,createBlankArtboard,deleteArtboard,duplicateArtboard,mmToUnit,moveArtboard,normalizeArtboardOrder,renameArtboard,resizeArtboard,setArtboardDisplayUnit,unitToMm,validateDesignTemplate} from '../src/index.js';
const template=():DesignTemplate=>({kind:'CARD_DESIGN',schemaVersion:1,id:'card-1',name:'Card',version:1,status:'DRAFT',sharedAssets:[],artboards:[createBlankArtboard({id:'front',name:'Front',order:0,widthMm:90,heightMm:50})]});
describe('Phase 6.0.2 artboard foundation',()=>{
it('adds and normalizes multiple artboards deterministically',()=>{const next=addArtboard(template(),createBlankArtboard({id:'back',name:'Back',order:9,widthMm:90,heightMm:50}));expect(next.artboards.map(a=>[a.name,a.order])).toEqual([['Front',0],['Back',1]]);expect(validateDesignTemplate(next).valid).toBe(true);});
it('duplicates next to source with independent ids',()=>{const next=duplicateArtboard(template(),'front','copy');expect(next.artboards.map(a=>a.id)).toEqual(['front','copy']);expect(next.artboards[1]?.name).toBe('Front Copy');});
it('renames reorders and resizes',()=>{let t=addArtboard(template(),createBlankArtboard({id:'back',name:'Back',order:1,widthMm:90,heightMm:50}));t=renameArtboard(t,'back','Reverse');t=resizeArtboard(t,'back',210,297);t=moveArtboard(t,'back',-1);expect(t.artboards[0]).toMatchObject({id:'back',name:'Reverse',widthMm:210,heightMm:297,order:0});});
it('prevents deleting final artboard',()=>expect(()=>deleteArtboard(template(),'front')).toThrow(/at least one artboard/i));
it('keeps physical size canonical while display unit changes',()=>{const t=setArtboardDisplayUnit(template(),'front','IN');expect(mmToUnit(t.artboards[0]!.widthMm,'IN')).toBeCloseTo(90/25.4,8);expect(unitToMm(mmToUnit(90,'IN'),'IN')).toBeCloseTo(90,8);expect(t.artboards[0]?.widthMm).toBe(90);});
it('normalizes arbitrary order values',()=>{const values=[createBlankArtboard({id:'c',name:'C',order:30,widthMm:1,heightMm:1}),createBlankArtboard({id:'a',name:'A',order:10,widthMm:1,heightMm:1}),createBlankArtboard({id:'b',name:'B',order:20,widthMm:1,heightMm:1})];expect(normalizeArtboardOrder(values).map(a=>[a.name,a.order])).toEqual([['A',0],['B',1],['C',2]]);});
});
