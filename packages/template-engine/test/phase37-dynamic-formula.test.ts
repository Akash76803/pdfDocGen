import { describe, expect, it } from 'vitest';
import { evaluateFormula, validateFormulaExpression } from '../src/formula-engine.js';
import { TemplateEngine } from '../src/template-engine.js';
import type { DocumentGroup, TemplateDefinition } from '@document-tool/contracts';

const bindings=[
  {id:'sgst',label:'SGST Amount',path:'items.sgst',sourceField:'SGST Amount',targetPath:'items.sgst'},
  {id:'cgst',label:'CGST Amount',path:'items.cgst',sourceField:'CGST Amount',targetPath:'items.cgst'},
  {id:'igst',label:'IGST Amount',path:'items.igst',sourceField:'IGST Amount',targetPath:'items.igst'},
];

describe('Phase 3.7 dynamic formula engine',()=>{
  it('calculates dynamic column aggregate formula',()=>{
    const value=evaluateFormula('SUM({{sgst}})+SUM({{cgst}})+SUM({{igst}})',bindings,{rows:[{sgst:10,cgst:10,igst:0},{sgst:5,cgst:5,igst:2}]});
    expect(value).toBe(32);
  });
  it('supports row-style arithmetic when a group contains one row',()=>{
    const value=evaluateFormula('{{sgst}}+{{cgst}}+{{igst}}',bindings,{rows:[{sgst:10,cgst:10,igst:2}]});
    expect(value).toBe(22);
  });
  it('supports ROUND and multiplication',()=>{
    const value=evaluateFormula('ROUND(SUM({{sgst}})*1.18,2)',bindings,{rows:[{sgst:10},{sgst:5}]});
    expect(value).toBe(17.7);
  });
  it('rejects unsafe JavaScript-like formula',()=>{
    expect(validateFormulaExpression('globalThis.alert(1)',bindings)).toBeTruthy();
  });
  it('renders formula through TemplateEngine summary table',()=>{
    const template:TemplateDefinition={id:'f',name:'Formula',version:1,page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}},header:{blocks:[]},footer:{blocks:[]},body:{blocks:[{id:'s',type:'SUMMARY_TABLE',dataMode:'MANUAL',sourcePath:'items',showHeader:false,columns:[{id:'l',label:'Label'},{id:'v',label:'Value'}],rows:[{id:'r',cells:[{id:'l1',columnId:'l',value:{operation:'STATIC',staticValue:'Total Tax'}},{id:'v1',columnId:'v',value:{operation:'FORMULA',expression:'SUM({{sgst}})+SUM({{cgst}})+SUM({{igst}})',formulaBindings:bindings,decimals:2,format:'NUMBER'}}]}]}]}};
    const data:DocumentGroup={id:'g',key:'g',header:{},items:[{sgst:10,cgst:10,igst:0},{sgst:5,cgst:5,igst:2}],sourceItems:[],itemDetails:[],sourceRowIndexes:[],warnings:[],valid:true};
    const result=new TemplateEngine().buildRenderModel(template,data);
    const summary=result.model?.body?.[0] as any;
    expect(summary.rows[0].cells[1].value).toBe('32.00');
  });
});
