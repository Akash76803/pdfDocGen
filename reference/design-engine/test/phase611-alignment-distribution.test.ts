import { describe,expect,it } from 'vitest';
import type { DesignTemplate } from '@document-tool/contracts';
import {
  addDesignElement,alignElements,centerElementsOnArtboard,createBlankArtboard,createShapeElement,
  distributeElements,getAlignmentUnitCount,groupElements,setElementLocked
} from '../src/index.js';

function base():DesignTemplate{
  let t:DesignTemplate={kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'Alignment',version:1,status:'DRAFT',sharedAssets:[],artboards:[createBlankArtboard({id:'a',name:'Front',order:0,widthMm:100,heightMm:60})]};
  t=addDesignElement(t,'a',createShapeElement('RECTANGLE',{id:'one',xMm:10,yMm:10,widthMm:10,heightMm:10,zIndex:0}));
  t=addDesignElement(t,'a',createShapeElement('RECTANGLE',{id:'two',xMm:35,yMm:20,widthMm:20,heightMm:10,zIndex:1}));
  t=addDesignElement(t,'a',createShapeElement('RECTANGLE',{id:'three',xMm:80,yMm:30,widthMm:10,heightMm:10,zIndex:2}));
  return t;
}
const e=(t:DesignTemplate,id:string)=>t.artboards[0]!.elements.find(x=>x.id===id)!;

describe('Phase 6.1.1 alignment and distribution',()=>{
  it('aligns multiple elements to selection left edge',()=>{
    const t=alignElements(base(),'a',['one','two','three'],'LEFT','SELECTION');
    expect(e(t,'one').position.xMm).toBe(10);
    expect(e(t,'two').position.xMm).toBe(10);
    expect(e(t,'three').position.xMm).toBe(10);
  });
  it('aligns a selection to artboard right and center',()=>{
    let t=alignElements(base(),'a',['one','two'],'RIGHT','ARTBOARD');
    expect(e(t,'one').position.xMm).toBe(90);
    expect(e(t,'two').position.xMm).toBe(80);
    t=centerElementsOnArtboard(t,'a',['one','two'],'VERTICAL');
    expect(e(t,'one').position.yMm).toBe(25);
    expect(e(t,'two').position.yMm).toBe(25);
  });
  it('distributes three elements horizontally with equal gaps inside selection bounds',()=>{
    const t=distributeElements(base(),'a',['one','two','three'],'HORIZONTAL','SELECTION');
    expect(e(t,'one').position.xMm).toBe(10);
    expect(e(t,'two').position.xMm).toBe(40);
    expect(e(t,'three').position.xMm).toBe(80);
  });
  it('distributes vertically across the whole artboard when requested',()=>{
    const t=distributeElements(base(),'a',['one','two','three'],'VERTICAL','ARTBOARD');
    expect(e(t,'one').position.yMm).toBe(0);
    expect(e(t,'two').position.yMm).toBe(25);
    expect(e(t,'three').position.yMm).toBe(50);
  });
  it('keeps grouped members as one atomic alignment unit',()=>{
    let t=groupElements(base(),'a',['one','two'],'g1','Pair');
    expect(getAlignmentUnitCount(t.artboards[0]!,['one','two','three'])).toBe(2);
    const beforeGap=e(t,'two').position.xMm-e(t,'one').position.xMm;
    t=alignElements(t,'a',['one','two','three'],'TOP','SELECTION');
    expect(e(t,'one').position.yMm).toBe(10);
    expect(e(t,'two').position.yMm).toBe(20); // relative group geometry is preserved
    expect(e(t,'two').position.xMm-e(t,'one').position.xMm).toBe(beforeGap);
    expect(e(t,'three').position.yMm).toBe(10);
  });
  it('never moves locked elements and treats partially locked groups as immovable',()=>{
    let t=setElementLocked(base(),'a','two',true);
    const before=e(t,'two').position.xMm;
    t=alignElements(t,'a',['one','two','three'],'RIGHT','ARTBOARD');
    expect(e(t,'two').position.xMm).toBe(before);
    expect(e(t,'one').position.xMm).toBe(90);
    t=groupElements(base(),'a',['one','two'],'g1','Pair');
    t=setElementLocked(t,'a','one',true);
    expect(getAlignmentUnitCount(t.artboards[0]!,['one','two','three'])).toBe(1);
  });
  it('requires at least three atomic units for distribution',()=>{
    const t=base();
    expect(distributeElements(t,'a',['one','two'],'HORIZONTAL','SELECTION')).toBe(t);
  });
});
