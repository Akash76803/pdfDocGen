import { describe,expect,it } from 'vitest';
import type { DesignTemplate } from '@document-tool/contracts';
import { addGuide,clearGuides,createBlankArtboard,deleteGuide,moveGuide,setAllGuidesLocked,setGuideLocked,snapMoveDelta } from '../src/index.js';

function fixture():DesignTemplate{return{kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'Guide fixture',version:1,status:'DRAFT',sharedAssets:[],artboards:[createBlankArtboard({id:'a',name:'Front',order:0,widthMm:90,heightMm:50})]};}

describe('Phase 6.1.3 rulers, grid and guides foundation',()=>{
  it('adds guides and clamps them to artboard bounds',()=>{
    let t=fixture();
    t=addGuide(t,'a',{id:'v',orientation:'VERTICAL',positionMm:120});
    t=addGuide(t,'a',{id:'h',orientation:'HORIZONTAL',positionMm:-3});
    expect(t.artboards[0]!.guides.map(g=>[g.id,g.positionMm])).toEqual([['v',90],['h',0]]);
  });
  it('moves, locks and deletes guides deterministically',()=>{
    let t=addGuide(fixture(),'a',{id:'g',orientation:'VERTICAL',positionMm:10});
    t=moveGuide(t,'a','g',25);expect(t.artboards[0]!.guides[0]!.positionMm).toBe(25);
    t=setGuideLocked(t,'a','g',true);
    const locked=t;t=moveGuide(t,'a','g',40);expect(t).toBe(locked);
    t=deleteGuide(t,'a','g');expect(t.artboards[0]!.guides).toHaveLength(1);
    t=setGuideLocked(t,'a','g',false);t=deleteGuide(t,'a','g');expect(t.artboards[0]!.guides).toHaveLength(0);
  });
  it('locks all guides and clears only unlocked guides by default',()=>{
    let t=fixture();
    t=addGuide(t,'a',{id:'a1',orientation:'VERTICAL',positionMm:5});
    t=addGuide(t,'a',{id:'a2',orientation:'HORIZONTAL',positionMm:5});
    t=setGuideLocked(t,'a','a1',true);
    t=clearGuides(t,'a');expect(t.artboards[0]!.guides.map(g=>g.id)).toEqual(['a1']);
    t=setAllGuidesLocked(t,'a',false);t=clearGuides(t,'a');expect(t.artboards[0]!.guides).toHaveLength(0);
  });
  it('existing smart snapping uses authored guides',()=>{
    let t=fixture();
    t=addGuide(t,'a',{id:'v',orientation:'VERTICAL',positionMm:20});
    t.artboards[0]!.elements.push({id:'e',type:'SHAPE',name:'Box',shape:'RECTANGLE',position:{xMm:10,yMm:10},size:{widthMm:8,heightMm:8},rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:0,fill:{type:'SOLID',color:'#fff',opacity:1},stroke:{color:'#000',widthMm:0,style:'NONE'}});
    const result=snapMoveDelta(t.artboards[0]!,['e'],{xMm:1.2,yMm:0},{snapToArtboard:false,snapToElements:false,snapToGuides:true,toleranceMm:1.5});
    expect(result.snappedX).toBe(true);expect(result.guides[0]?.source).toBe('GUIDE');
  });
});
