import { describe, expect, it } from 'vitest';
import { MappingEngine } from '../src/engine.js';
import type { MappingProfile, NormalizedData } from '@document-tool/contracts';

const data: NormalizedData = { schema: { fields: [
  { name:'InvoiceNo',label:'InvoiceNo',type:'string',required:false },
  { name:'CustomerName',label:'CustomerName',type:'string',required:false },
  { name:'Product',label:'Product',type:'string',required:false },
]}, records: [] };
const base: MappingProfile = { id:'p',name:'p',mappings:[
  {id:'1',sourceField:'InvoiceNo',targetPath:'invoice.number',role:'GROUP_KEY'},
  {id:'2',sourceField:'CustomerName',targetPath:'customer.name',role:'HEADER_FIELD'},
  {id:'3',sourceField:'Product',targetPath:'items.product',role:'LINE_ITEM_FIELD'},
],groupDefinition:{mode:'GROUP_BY_FIELD',groupKey:{sourceField:'InvoiceNo',targetPath:'invoice.number'}} };

describe('MappingEngine',()=>{
 it('maps source fields to nested canonical target paths',()=>{const out=new MappingEngine().mapRecord({InvoiceNo:'INV1',CustomerName:'ABC'},base.mappings);expect(out).toEqual({invoice:{number:'INV1'},customer:{name:'ABC'}});});
 it('ignores IGNORE fields',()=>{const out=new MappingEngine().mapRecord({Product:'A'},[{id:'x',sourceField:'Product',targetPath:'items.product',role:'IGNORE'}]);expect(out).toEqual({});});
 it('rejects missing source fields',()=>{const profile={...base,mappings:[...base.mappings,{id:'4',sourceField:'Missing',targetPath:'x.y',role:'HEADER_FIELD' as const}]};expect(new MappingEngine().validate(profile,data.schema).errors.some(e=>e.code==='MAPPING_SOURCE_NOT_FOUND')).toBe(true);});
 it('rejects duplicate targets',()=>{const profile={...base,mappings:[...base.mappings,{id:'4',sourceField:'Product',targetPath:'customer.name',role:'LINE_ITEM_FIELD' as const}]};expect(new MappingEngine().validate(profile,data.schema).errors.some(e=>e.code==='MAPPING_TARGET_DUPLICATE')).toBe(true);});
 it('requires one group key for grouped mode',()=>{const profile={...base,mappings:base.mappings.map(m=>m.role==='GROUP_KEY'?{...m,role:'HEADER_FIELD' as const}:m),groupDefinition:{mode:'GROUP_BY_FIELD' as const}};expect(new MappingEngine().validate(profile,data.schema).errors.some(e=>e.code==='GROUP_KEY_REQUIRED')).toBe(true);});
});
