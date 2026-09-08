import {describe,expect,it} from 'vitest';
import type {DesignBinding,DesignTemplate,ImageDesignElement,ShapeDesignElement,TextDesignElement} from '@document-tool/contracts';
import {copyDesignElementStyle,createLinearGradientFill,createShapeElement,normalizeGradientAngle,normalizeGradientStopPosition,pasteDesignElementStyle,resetDesignElementStyle,updateElementsOpacity} from '../src/index.js';

const binding:DesignBinding={source:'SOURCE_FIELD',path:'Employee.Name'};
const shape=(id:string):ShapeDesignElement=>({...createShapeElement('RECTANGLE',{id,xMm:7,yMm:9,widthMm:30,heightMm:12}),name:id,binding});

describe('Phase 6.1.4 advanced styling',()=>{
  it('creates and updates normalized linear gradients with at least two stops',()=>{
    const fill=createLinearGradientFill(420,[{offset:-10,color:'#000000'},{offset:140,color:'#ffffff'}]);
    expect(fill.type).toBe('LINEAR_GRADIENT');
    if(fill.type!=='LINEAR_GRADIENT')return;
    expect(fill.gradient.angleDeg).toBe(360);
    expect(fill.gradient.stops.map(stop=>stop.offset)).toEqual([0,100]);
    const fallback=createLinearGradientFill(-20,[{offset:50,color:'#123456'}]);
    expect(fallback.type==='LINEAR_GRADIENT'&&fallback.gradient.stops).toHaveLength(2);
    expect(normalizeGradientAngle(Number.NaN)).toBe(0);
    expect(normalizeGradientStopPosition(45)).toBe(45);
  });

  it('clamps element opacity and updates multiple compatible elements',()=>{
    const a=shape('a'),b=shape('b');
    const template:DesignTemplate={kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'T',version:1,status:'DRAFT',sharedAssets:[],artboards:[{id:'front',name:'Front',order:0,widthMm:90,heightMm:50,displayUnit:'MM',background:{type:'SOLID',color:'#fff'},print:{bleed:{topMm:0,rightMm:0,bottomMm:0,leftMm:0},safeArea:{topMm:0,rightMm:0,bottomMm:0,leftMm:0}},guides:[],groups:[],elements:[a,b]}]};
    expect(updateElementsOpacity(template,'front',['a','b'],2).artboards[0]!.elements.map(e=>e.opacity)).toEqual([1,1]);
    expect(updateElementsOpacity(template,'front',['a','b'],-1).artboards[0]!.elements.map(e=>e.opacity)).toEqual([0,0]);
  });

  it('supports shadow defaults and shape borders',()=>{
    const element=shape('styled');
    expect(element.shadow?.enabled).toBe(false);
    const updated={...element,shadow:{...element.shadow!,enabled:true,blurMm:4},stroke:{color:'#ff0000',widthMm:1,style:'DASHED' as const,opacity:.5}};
    expect(updated.shadow).toMatchObject({enabled:true,blurMm:4});
    expect(updated.stroke).toEqual({color:'#ff0000',widthMm:1,style:'DASHED',opacity:.5});
  });

  it('copies only compatible visual style while preserving target identity and data',()=>{
    const source={...shape('source'),fill:createLinearGradientFill(45),opacity:.4};
    const target={...shape('target'),textMarker:'ignored',position:{xMm:44,yMm:33},size:{widthMm:8,heightMm:6},binding:{source:'SOURCE_FIELD' as const,path:'Target.Path'}};
    const clipboard=copyDesignElementStyle(source)!;
    const pasted=pasteDesignElementStyle(target,clipboard) as ShapeDesignElement;
    expect(pasted.id).toBe('target');expect(pasted.position).toEqual({xMm:44,yMm:33});expect(pasted.size).toEqual({widthMm:8,heightMm:6});expect(pasted.binding?.path).toBe('Target.Path');expect(pasted.fill).toEqual(source.fill);
    const text:TextDesignElement={id:'text',type:'TEXT',name:'Text',position:{xMm:1,yMm:2},size:{widthMm:20,heightMm:5},rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:0,text:'Keep me',binding,style:{fontFamily:'Arial',fontSizePt:10,fontWeight:400,italic:false,underline:false,color:'#000',alignment:'LEFT',lineHeight:1.2,letterSpacingPt:0}};
    const cross=pasteDesignElementStyle(text,clipboard) as TextDesignElement;
    expect(cross.text).toBe('Keep me');expect(cross.style).toEqual(text.style);expect(cross.opacity).toBe(.4);
    const textSource={...text,id:'text-source',text:'Source content',style:{...text.style,color:'#ff0000',fontWeight:700}};
    const textTarget={...text,id:'text-target',text:'Target content',position:{xMm:21,yMm:22},binding:{source:'SOURCE_FIELD' as const,path:'Target.Name'}};
    const styledText=pasteDesignElementStyle(textTarget,copyDesignElementStyle(textSource)!) as TextDesignElement;
    expect(styledText.id).toBe('text-target');expect(styledText.text).toBe('Target content');expect(styledText.position).toEqual({xMm:21,yMm:22});expect(styledText.binding?.path).toBe('Target.Name');expect(styledText.style.color).toBe('#ff0000');
  });

  it('resets visual style without changing geometry, content, binding or asset reference',()=>{
    const original={...shape('reset'),position:{xMm:12,yMm:13},fill:createLinearGradientFill(90),opacity:.2};
    const reset=resetDesignElementStyle(original) as ShapeDesignElement;
    expect(reset.id).toBe(original.id);expect(reset.position).toEqual(original.position);expect(reset.binding).toEqual(original.binding);expect(reset.opacity).toBe(1);
    const image:ImageDesignElement={id:'image',type:'IMAGE',name:'Photo',position:{xMm:3,yMm:4},size:{widthMm:20,heightMm:30},rotationDeg:0,opacity:.3,visible:true,locked:false,zIndex:1,assetId:'asset-photo',fit:'FILL',binding};
    const resetImage=resetDesignElementStyle(image) as ImageDesignElement;
    expect(resetImage.assetId).toBe('asset-photo');expect(resetImage.position).toEqual(image.position);expect(resetImage.binding).toEqual(binding);
  });
});
