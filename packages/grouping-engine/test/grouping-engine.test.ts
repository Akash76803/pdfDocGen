import { describe, expect, it } from 'vitest';
import { GroupingEngine } from '../src/grouping-engine.js';
import type { MappingProfile, NormalizedData } from '@document-tool/contracts';

function data(records: NormalizedData['records']): NormalizedData { return { schema:{ fields:['InvoiceNo','CustomerName','Product','Qty','Tax','Ignored'].map(name=>({name,label:name,type:(name==='Qty'||name==='Tax')?'number':'string',required:false})) }, records, metadata:{headerRow:1} }; }
const profile:MappingProfile={id:'invoice',name:'Invoice',mappings:[
{id:'1',sourceField:'InvoiceNo',targetPath:'invoice.number',role:'GROUP_KEY'},
{id:'2',sourceField:'CustomerName',targetPath:'customer.name',role:'HEADER_FIELD'},
{id:'3',sourceField:'Product',targetPath:'items.product',role:'LINE_ITEM_FIELD'},
{id:'4',sourceField:'Qty',targetPath:'items.qty',role:'LINE_ITEM_FIELD'},
{id:'5',sourceField:'Ignored',targetPath:'ignored.value',role:'IGNORE'},
],groupDefinition:{mode:'GROUP_BY_FIELD',groupKey:{sourceField:'InvoiceNo',targetPath:'invoice.number'}}};

describe('GroupingEngine',()=>{
 it('groups multiple invoice rows into separate document groups and items',()=>{const r=new GroupingEngine().group(data([{InvoiceNo:'INV003',CustomerName:'C',Product:'A',Qty:1},{InvoiceNo:'INV001',CustomerName:'A',Product:'B',Qty:2},{InvoiceNo:'INV003',CustomerName:'C',Product:'C',Qty:3},{InvoiceNo:'INV002',CustomerName:'B',Product:'D',Qty:4}]),profile);expect(r.groups.map(g=>g.key)).toEqual(['INV003','INV001','INV002']);expect(r.groups[0]?.items).toHaveLength(2);expect(r.groups[0]?.items[0]).toEqual({items:{product:'A',qty:1}});expect(r.statistics.groupCount).toBe(3);});
 it('keeps first non-null header and ignores null values for conflict comparison',()=>{const r=new GroupingEngine().group(data([{InvoiceNo:'INV1',CustomerName:'ABC',Product:'A',Qty:1},{InvoiceNo:'INV1',CustomerName:null,Product:'B',Qty:2},{InvoiceNo:'INV1',CustomerName:'ABC',Product:'C',Qty:3}]),profile);expect(r.groups[0]?.valid).toBe(true);expect(r.groups[0]?.header).toEqual({invoice:{number:'INV1'},customer:{name:'ABC'}});});
 it('detects header conflicts with row traceability',()=>{const r=new GroupingEngine().group(data([{InvoiceNo:'INV1',CustomerName:'ABC',Product:'A',Qty:1},{InvoiceNo:'INV1',CustomerName:'XYZ',Product:'B',Qty:2}]),profile);expect(r.groups[0]?.valid).toBe(false);const w=r.groups[0]?.warnings[0];expect(w?.code).toBe('HEADER_VALUE_CONFLICT');expect(w?.conflictingValues).toEqual(['ABC','XYZ']);expect(w?.sourceRowIndexes).toEqual([2,3]);});
 it('skips and reports missing group keys',()=>{const r=new GroupingEngine().group(data([{InvoiceNo:null,CustomerName:'ABC',Product:'A',Qty:1},{InvoiceNo:'INV1',CustomerName:'ABC',Product:'B',Qty:2}]),profile);expect(r.groups).toHaveLength(1);expect(r.statistics.skippedRowCount).toBe(1);expect(r.warnings.some(w=>w.code==='GROUP_KEY_MISSING')).toBe(true);});
 it('preserves source row indexes and source item order',()=>{const r=new GroupingEngine().group(data([{InvoiceNo:'INV1',CustomerName:'ABC',Product:'A',Qty:1},{InvoiceNo:'INV1',CustomerName:'ABC',Product:'B',Qty:2}]),profile);expect(r.groups[0]?.sourceRowIndexes).toEqual([2,3]);expect(r.groups[0]?.itemDetails.map(i=>i.sourceRowIndex)).toEqual([2,3]);expect(r.groups[0]?.sourceItems).toEqual([{InvoiceNo:'INV1',CustomerName:'ABC',Product:'A',Qty:1},{InvoiceNo:'INV1',CustomerName:'ABC',Product:'B',Qty:2}]);});
 it('supports one row per document mode',()=>{const p={...profile,groupDefinition:{mode:'ONE_ROW_PER_DOCUMENT' as const}};const r=new GroupingEngine().group(data([{InvoiceNo:'INV1',CustomerName:'A',Product:'A',Qty:1},{InvoiceNo:'INV2',CustomerName:'B',Product:'B',Qty:2}]),p);expect(r.groups).toHaveLength(2);expect(r.groups[0]?.sourceRowIndexes).toEqual([2]);});
 it('supports full file report mode',()=>{const p={...profile,groupDefinition:{mode:'FULL_FILE_REPORT' as const}};const r=new GroupingEngine().group(data([{InvoiceNo:'INV1',CustomerName:'A',Product:'A',Qty:1},{InvoiceNo:'INV2',CustomerName:'B',Product:'B',Qty:2}]),p);expect(r.groups).toHaveLength(1);expect(r.groups[0]?.items).toHaveLength(2);});
});

describe('summary field role',()=>{
 it('keeps row-varying summary fields in items without header conflicts',()=>{
  const p={...profile,mappings:[...profile.mappings,{id:'sum',sourceField:'Tax',targetPath:'items.tax',role:'SUMMARY_FIELD' as const,summaryAggregation:'SUM' as const}]};
  const r=new GroupingEngine().group(data([{InvoiceNo:'INV1',CustomerName:'ABC',Product:'A',Qty:1,Tax:10},{InvoiceNo:'INV1',CustomerName:'ABC',Product:'B',Qty:2,Tax:20}]),p);
  expect(r.groups).toHaveLength(1); expect(r.groups[0]?.valid).toBe(true); expect(r.groups[0]?.warnings).toHaveLength(0);
  expect(r.groups[0]?.items.map(i=>(i.items as any)?.tax)).toEqual([10,20]);
 });
});
