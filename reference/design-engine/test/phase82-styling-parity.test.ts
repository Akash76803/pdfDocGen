import {describe,expect,it} from 'vitest';
import type {DesignFill,DesignStroke,DesignTemplate,ShapeDesignElement} from '@document-tool/contracts';
import {
  createShapeElement,
  deserializeDesignTemplate,
  designFillEquals,
  designStrokeEquals,
  normalizeDesignFill,
  normalizeDesignStroke,
  normalizeImageFillTransform,
  normalizePatternFill,
  normalizeRadialGradient,
  normalizeStrokeDashArray,
  serializeDesignTemplate,
} from '../src/index.js';

const shape=(fill:DesignFill,stroke:DesignStroke):ShapeDesignElement=>({...createShapeElement('RECTANGLE',{id:'shape',xMm:5,yMm:5,widthMm:30,heightMm:20}),fill,stroke});
const template=(element:ShapeDesignElement):DesignTemplate=>({kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'T',version:1,status:'DRAFT',sharedAssets:[],artboards:[{id:'a',name:'A',order:0,widthMm:90,heightMm:50,displayUnit:'MM',background:{type:'SOLID',color:'#fff'},print:{bleed:{topMm:0,rightMm:0,bottomMm:0,leftMm:0},safeArea:{topMm:0,rightMm:0,bottomMm:0,leftMm:0}},guides:[],groups:[],elements:[element]}]});

describe('Phase 8.2 styling contract and parity foundation',()=>{
 it('normalizes radial gradients and pattern fills',()=>{
  const radial=normalizeRadialGradient({centerX:-20,centerY:140,radius:0,stops:[{offset:120,color:'#fff'},{offset:-10,color:'#000'}]});
  expect(radial.centerX).toBe(0);expect(radial.centerY).toBe(100);expect(radial.radius).toBe(1);expect(radial.stops.map(s=>s.offset)).toEqual([0,100]);
  const pattern=normalizePatternFill({kind:'DOT',scale:50,rotationDeg:-30,opacity:2});
  expect(pattern.kind).toBe('DOT');expect(pattern.scale).toBe(8);expect(pattern.rotationDeg).toBe(330);expect(pattern.opacity).toBe(1);
 });

 it('normalizes persistent image crop transforms',()=>{
  expect(normalizeImageFillTransform({scale:20,offsetX:999,offsetY:-999,rotationDeg:-45})).toEqual({scale:10,offsetX:200,offsetY:-200,rotationDeg:315});
  const fill=normalizeDesignFill({type:'IMAGE',assetId:'asset',fit:'FILL',transform:{scale:1.5,offsetX:20,offsetY:-10,rotationDeg:25}});
  expect(fill.type).toBe('IMAGE');
  if(fill.type==='IMAGE')expect(fill.transform).toEqual({scale:1.5,offsetX:20,offsetY:-10,rotationDeg:25});
 });

 it('normalizes advanced vector strokes and dash arrays',()=>{
  const stroke=normalizeDesignStroke({color:'#123456',widthMm:1,style:'CUSTOM',opacity:.6,lineCap:'ROUND',lineJoin:'BEVEL',miterLimit:0,dashArray:[3,-1,1,0],dashOffset:2});
  expect(stroke).toMatchObject({style:'CUSTOM',lineCap:'ROUND',lineJoin:'BEVEL',miterLimit:1,dashArray:[3,1],dashOffset:2});
  expect(normalizeStrokeDashArray(stroke)).toEqual([3,1]);
  expect(normalizeStrokeDashArray({...stroke,style:'DASHED'})).toEqual([2,1.2]);
 });

 it('compares advanced fill and stroke values semantically',()=>{
  const a:DesignFill={type:'RADIAL_GRADIENT',gradient:{type:'RADIAL',centerX:50,centerY:50,radius:50,stops:[{offset:0,color:'#000'},{offset:100,color:'#fff'}]}};
  expect(designFillEquals(a,JSON.parse(JSON.stringify(a)))).toBe(true);
  const sa:DesignStroke={color:'#000',widthMm:1,style:'CUSTOM',dashArray:[2,1],lineCap:'ROUND',lineJoin:'MITER'};
  expect(designStrokeEquals(sa,{...sa,dashArray:[2,1]})).toBe(true);
  expect(designStrokeEquals(sa,{...sa,dashArray:[3,1]})).toBe(false);
 });

 it('round-trips new styling without changing schema version',()=>{
  const fill:DesignFill={type:'PATTERN',pattern:{kind:'CHECKER',foreground:'#111111',background:'#eeeeee',scale:1.5,rotationDeg:15,opacity:.7}};
  const stroke:DesignStroke={color:'#ff0000',widthMm:.8,style:'CUSTOM',opacity:.9,lineCap:'SQUARE',lineJoin:'ROUND',miterLimit:6,dashArray:[2,.5,1,.5],dashOffset:.25};
  const original=template(shape(fill,stroke));
  const parsed=deserializeDesignTemplate(serializeDesignTemplate(original));
  const restored=parsed.artboards[0]!.elements[0] as ShapeDesignElement;
  expect(restored.fill).toEqual(fill);
  expect(restored.stroke).toMatchObject(stroke);
  expect(parsed.schemaVersion).toBe(1);
 });
});
