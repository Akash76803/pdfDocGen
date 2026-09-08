import { describe, expect, it } from 'vitest';
import type { DocumentGroup, TemplateDefinition } from '@document-tool/contracts';
import { TemplateEngine } from '../src/template-engine.js';

const group: DocumentGroup = { id:'g', key:'INV-1', header:{invoice:{number:'INV-1'}}, items:[], itemDetails:[], sourceRowIndexes:[0], warnings:[], valid:true };

function template(): TemplateDefinition {
  return { id:'box-t', name:'Box', version:1, page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}}, header:{blocks:[]}, footer:{blocks:[]}, body:{blocks:[{
    id:'box', type:'BOX', name:'Signature Box', style:{widthMode:'PERCENT',widthPercent:60,heightMode:'MINIMUM',minHeightMm:30,overflow:'EXPAND',backgroundColor:'#F3F4F6',border:{style:'SOLID',width:1,color:'#111827'},borderRadiusMm:3,padding:{top:2,right:2,bottom:2,left:2},horizontalAlignment:'LEFT',verticalAlignment:'CENTER'}, layout:{widthPercent:60,alignment:'LEFT',keepTogether:true}, children:[{id:'f',type:'FIELD',label:'Invoice',path:'invoice.number'}]
  }]}};
}

describe('Phase 4.6 Box and advanced cell controls',()=>{
  it('resolves BOX and dynamic child content',()=>{
    const result=new TemplateEngine().buildRenderModel(template(),group);
    expect(result.errors).toHaveLength(0);
    const box=result.model?.body?.[0];
    expect(box?.type).toBe('BOX');
    if(box?.type!=='BOX') throw new Error('Expected BOX');
    expect(box.style.widthPercent).toBe(60);
    expect(box.style.minHeightMm).toBe(30);
    expect(box.style.borderRadiusMm).toBe(3);
    expect(box.layout.keepTogether).toBe(true);
    expect(box.children[0]?.type).toBe('FIELD');
    expect(box.children[0]?.type==='FIELD' ? box.children[0].value : null).toBe('INV-1');
  });

  it('keeps legacy cell minHeight while resolving shared box fields',()=>{
    const t=template();
    t.body.blocks=[{id:'row',type:'ROW',children:[],columns:[{id:'c',widthPercent:100,style:{minHeight:20,heightMode:'MINIMUM',minHeightMm:25,borderRadiusMm:2},children:[{id:'txt',type:'TEXT',text:'x'}]}]}];
    const result=new TemplateEngine().buildRenderModel(t,group);
    const row=result.model?.body?.[0];
    if(row?.type!=='ROW') throw new Error('Expected ROW');
    expect(row.columns[0]?.style.minHeight).toBe(20);
    expect(row.columns[0]?.style.minHeightMm).toBe(25);
    expect(row.columns[0]?.style.borderRadiusMm).toBe(2);
  });

  it('rejects invalid fixed box dimensions',()=>{
    const t=template();
    const box=t.body.blocks[0];
    if(box.type!=='BOX') throw new Error('Expected BOX');
    box.style={...box.style,widthMode:'FIXED_MM',widthMm:0,heightMode:'FIXED',heightMm:-1};
    const validation=new TemplateEngine().validate(t);
    expect(validation.valid).toBe(false);
  });
});
