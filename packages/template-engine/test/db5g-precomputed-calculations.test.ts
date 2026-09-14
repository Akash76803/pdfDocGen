import { describe, expect, it } from 'vitest';
import type { DocumentGroup, TemplateDefinition } from '@document-tool/contracts';
import { TemplateEngine } from '../src/template-engine.js';

const template: TemplateDefinition = {
  id:'db5g-calc', name:'DB5G Precomputed Formula Bridge', version:1,
  page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}},
  calculatedFields:[],
  header:{blocks:[]},
  body:{blocks:[
    {id:'words',type:'TEXT',text:'Amount {{calc.amountWords}}'},
    {id:'number',type:'FIELD',path:'calc.grandTotal'},
  ]},
  footer:{blocks:[]},
};

const group: DocumentGroup = {
  id:'inv-1', key:'INV-1',
  header:{ invoiceNo:'INV-1', calc:{ grandTotal:1234.5, amountWords:'One Thousand Two Hundred Thirty Four Rupees and Fifty Paise Only' } },
  items:[], sourceItems:[], itemDetails:[], sourceRowIndexes:[], warnings:[], valid:true,
};

describe('DB-5G precomputed native calculations', () => {
  it('preserves DocumentGroup header.calc when no Template calculated field overwrites it', () => {
    const result=new TemplateEngine().buildRenderModel(template,group);
    expect(result.errors).toEqual([]);
    expect((result.model!.body[0] as any).text).toContain('One Thousand Two Hundred Thirty Four');
    expect((result.model!.body[1] as any).value).toBe('1234.5');
  });
});
