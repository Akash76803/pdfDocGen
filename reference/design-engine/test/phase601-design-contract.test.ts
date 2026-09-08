import { describe,expect,it } from 'vitest';
import type { DesignTemplate, TextDesignElement } from '@document-tool/contracts';
import { CARD_DESIGN_SCHEMA_VERSION, createDefaultDesignElementRegistry, deserializeDesignTemplate, resolveCardRenderModel, serializeDesignTemplate, validateDesignTemplate } from '../src/index.js';

const text=(id:string,zIndex=0):TextDesignElement=>({id,type:'TEXT',name:id,position:{xMm:1,yMm:2},size:{widthMm:40,heightMm:10},rotationDeg:0,opacity:1,visible:true,locked:false,zIndex,text:'Static',style:{fontFamily:'Arial',fontSizePt:10,fontWeight:400,italic:false,underline:false,color:'#000000',alignment:'LEFT',lineHeight:1.2,letterSpacingPt:0}});
const template=():DesignTemplate=>({kind:'CARD_DESIGN',schemaVersion:CARD_DESIGN_SCHEMA_VERSION,id:'card-1',name:'Front Back Card',version:1,status:'DRAFT',sharedAssets:[],artboards:[
  {id:'back',name:'Back',order:2,widthMm:90,heightMm:50,displayUnit:'MM',background:{type:'SOLID',color:'#fff'},print:{bleed:{topMm:3,rightMm:3,bottomMm:3,leftMm:3},safeArea:{topMm:4,rightMm:4,bottomMm:4,leftMm:4}},guides:[],groups:[],elements:[text('back-text')]},
  {id:'front',name:'Front',order:1,widthMm:90,heightMm:50,displayUnit:'MM',background:{type:'SOLID',color:'#fff'},print:{bleed:{topMm:3,rightMm:3,bottomMm:3,leftMm:3},safeArea:{topMm:4,rightMm:4,bottomMm:4,leftMm:4}},guides:[],groups:[],elements:[{...text('front-text'),bindings:[{id:'b1',targetProperty:'text',sourceType:'FIELD',fieldPath:'customer.name',fallbackValue:'Customer'}]}]},
]});

describe('Phase 6.0.1 shared design contract',()=>{
  it('accepts a first-class multi-artboard template and keeps deterministic order',()=>{
    const input=template(); expect(validateDesignTemplate(input).valid).toBe(true);
    const result=resolveCardRenderModel(input,{recordKey:'C001'});
    expect(result.errors).toEqual([]); expect(result.model?.artboards.map(a=>a.name)).toEqual(['Front','Back']);
    // Without explicit resolution, it remains the original static text
    expect(result.model?.artboards[0].elements[0].content.text).toBe('Static');
  });
  it('supports mixed artboard sizes without a schema migration',()=>{
    const input=template(); input.artboards.push({...input.artboards[0],id:'a4',name:'Insert',order:3,widthMm:210,heightMm:297,elements:[text('a4-text')]});
    expect(validateDesignTemplate(input).valid).toBe(true);
    expect(resolveCardRenderModel(input).model?.artboards[2]).toMatchObject({widthMm:210,heightMm:297});
  });
  it('serializes and restores the template losslessly',()=>{
    const input=template(); const output=deserializeDesignTemplate(serializeDesignTemplate(input)); expect(output).toEqual(input);
  });
  it('rejects duplicate ids, invalid geometry and missing asset references',()=>{
    const input=template(); input.artboards[1].elements[0].id='back-text'; input.artboards[0].widthMm=0;
    input.artboards[0].elements.push({id:'logo',type:'IMAGE',name:'Logo',position:{xMm:0,yMm:0},size:{widthMm:20,heightMm:20},rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:2,assetId:'missing',fit:'FIT'});
    const result=validateDesignTemplate(input); expect(result.valid).toBe(false);
    expect(result.errors.map(e=>e.code)).toEqual(expect.arrayContaining(['ELEMENT_ID_DUPLICATE','ARTBOARD_DIMENSION_INVALID','ASSET_REFERENCE_MISSING']));
  });
  it('supports custom elements only through the registry extension point',()=>{
    const input=template(); input.artboards[0].elements.push({id:'custom',type:'CUSTOM',customType:'ORNAMENT',name:'Ornament',position:{xMm:0,yMm:0},size:{widthMm:10,heightMm:10},rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:3,props:{variant:'leaf'}});
    expect(validateDesignTemplate(input).valid).toBe(false);
    const registry=createDefaultDesignElementRegistry().register({key:'CUSTOM:ORNAMENT'});
    expect(validateDesignTemplate(input,registry).valid).toBe(true);
  });
  it('does not evaluate platform business logic inside the design engine',()=>{
    const input=template(); 
    const noResolver=resolveCardRenderModel(input); 
    // Without resolving upstream, render-model does NOT evaluate field paths. It leaves it as Static.
    expect(noResolver.model?.artboards[0].elements[0].content.text).toBe('Static');
  });
});
