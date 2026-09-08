import { describe, expect, it } from 'vitest';
import type { DesignElement, DesignFill, DesignTemplate, PathDesignElement, ShapeDesignElement } from '@document-tool/contracts';
import {
  designFillEquals,
  designStrokeEquals,
  deserializeDesignTemplate,
  getElementCapabilities,
  normalizeDesignFill,
  normalizeDesignStroke,
  resolveMixedValue,
  selectByMarquee,
  selectOnly,
  toggleSelection,
} from '../src/index.js';

const base = { position:{xMm:0,yMm:0}, size:{widthMm:20,heightMm:10}, rotationDeg:0, opacity:1, visible:true, locked:false, zIndex:0 } as const;
const shape = (id:string, kind:ShapeDesignElement['shape']='RECTANGLE'):ShapeDesignElement => ({ ...base, id, type:'SHAPE', name:id, shape:kind, fill:{type:'SOLID',color:'#fff'}, stroke:{color:'#000',widthMm:.2,style:'SOLID'} });
const path = (id:string, closed:boolean):PathDesignElement => ({ ...base, id, type:'PATH', name:id, geometry:{points:[{id:'p1',x:0,y:0},{id:'p2',x:10,y:0}],segments:[{id:'s1',type:'LINE',fromPointId:'p1',toPointId:'p2'}],closed}, fill:{type:'SOLID',color:'#fff'}, stroke:{color:'#000',widthMm:.2,style:'SOLID'} });

const template = ():DesignTemplate => ({kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'T',version:1,status:'DRAFT',sharedAssets:[],artboards:[{id:'a',name:'A',order:0,widthMm:90,heightMm:50,displayUnit:'MM',background:{type:'SOLID',color:'#fff'},print:{bleed:{topMm:0,rightMm:0,bottomMm:0,leftMm:0},safeArea:{topMm:0,rightMm:0,bottomMm:0,leftMm:0}},guides:[],groups:[],elements:[shape('one'),shape('two')]}]});

describe('Phase 8.0 shape operations foundation',()=>{
  it('centralizes vector capabilities and rejects Boolean/fill capability for open geometry',()=>{
    expect(getElementCapabilities(shape('rect')).boolean).toBe(true);
    expect(getElementCapabilities(shape('line','LINE'))).toMatchObject({fill:false,stroke:true,boolean:false});
    expect(getElementCapabilities(path('closed',true))).toMatchObject({fill:true,geometryEdit:true,boolean:true});
    expect(getElementCapabilities(path('open',false))).toMatchObject({fill:false,geometryEdit:true,boolean:false});
  });

  it('returns conservative capabilities for non-vector element kinds',()=>{
    const text:DesignElement={...base,id:'txt',type:'TEXT',name:'Text',text:'Hi',style:{fontFamily:'Arial',fontSizePt:12,fontWeight:400,italic:false,underline:false,color:'#000',alignment:'LEFT',lineHeight:1.2,letterSpacingPt:0}};
    expect(getElementCapabilities(text)).toMatchObject({transform:true,text:true,boolean:false,geometryEdit:false});
  });

  it('resolves primitive and structured mixed values semantically',()=>{
    expect(resolveMixedValue([shape('a'),shape('b')], e=>e.rotationDeg)).toEqual({mixed:false,value:0});
    const changed=[shape('a'),{...shape('b'),rotationDeg:15}];
    expect(resolveMixedValue(changed,e=>e.rotationDeg)).toEqual({mixed:true});
    const fillA:DesignFill={type:'SOLID',color:'#fff'};
    const fillB:DesignFill={type:'SOLID',color:'#fff',opacity:1};
    expect(resolveMixedValue([fillA,fillB], value=>value,designFillEquals)).toEqual({mixed:false,value:fillA});
    expect(designStrokeEquals({color:'#000',widthMm:1,style:'SOLID'},{color:'#000',widthMm:1,style:'SOLID',opacity:1})).toBe(true);
  });

  it('normalizes style values and supplies advanced stroke defaults',()=>{
    expect(normalizeDesignFill({type:'SOLID',color:'#abc',opacity:7})).toEqual({type:'SOLID',color:'#abc',opacity:1});
    expect(normalizeDesignStroke({color:'#000',widthMm:-2,style:'SOLID'})).toEqual({color:'#000',widthMm:0,style:'SOLID',lineCap:'BUTT',lineJoin:'MITER',miterLimit:4,dashOffset:0});
  });

  it('deserializes current schema through normalization and preserves template identity',()=>{
    const raw=template();
    raw.artboards[0]!.elements[0]!.opacity=2;
    const parsed=deserializeDesignTemplate(JSON.stringify(raw));
    expect(parsed.id).toBe('t');
    expect(parsed.artboards[0]!.elements[0]!.opacity).toBe(1);
  });

  it('keeps deterministic primary selection for click, toggle and marquee',()=>{
    const artboard=template().artboards[0]!;
    let selection=selectOnly('a','one');
    selection=toggleSelection(selection,'two');
    expect(selection.primaryElementId).toBe('two');
    selection=toggleSelection(selection,'two');
    expect(selection.primaryElementId).toBe('one');
    const marquee=selectByMarquee(artboard,{xMm:-1,yMm:-1,widthMm:30,heightMm:20});
    expect(marquee.primaryElementId).toBe('two');
  });
});
