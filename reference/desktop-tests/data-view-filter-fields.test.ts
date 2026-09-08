import { describe, expect, it } from 'vitest';
import type { FieldDefinition, MappingDefinition } from '@document-tool/contracts';
import { augmentFilterFieldsWithImportedSource, coerceFilterValue, operatorsForFilterType } from '../src/utils/dataViewFilters.ts';

const schema:FieldDefinition[]=[
  {name:'Product Name',label:'Product Name',type:'string',required:false},
  {name:'Quantity',label:'Quantity',type:'number',required:false},
  {name:'Amount',label:'Amount',type:'number',required:false},
  {name:'Active',label:'Active',type:'boolean',required:false},
  {name:'Invoice Date',label:'Invoice Date',type:'date',required:false},
  {name:'Nested',label:'Nested',type:'object',required:false},
];
const mappings:MappingDefinition[]=[
  {id:'qty',sourceField:'Quantity',targetPath:'items.qty',role:'LINE_ITEM_FIELD'},
  {id:'amount',sourceField:'Amount',targetPath:'items.amount',role:'SUMMARY_FIELD',summaryAggregation:'SUM'},
];

describe('Data View filter field discovery',()=>{
  it('keeps numeric normalized fields and adds primitive imported text/boolean/date fields',()=>{
    const result=augmentFilterFieldsWithImportedSource('items',[
      {value:'qty',label:'Quantity',sourceField:'Quantity',targetPath:'items.qty'},
      {value:'amount',label:'Amount',sourceField:'Amount',targetPath:'items.amount'},
    ],schema,mappings);
    expect(result.find((field)=>field.sourceField==='Product Name')).toMatchObject({dataType:'string',rawSource:true});
    expect(result.find((field)=>field.sourceField==='Quantity')).toMatchObject({value:'qty',dataType:'number'});
    expect(result.find((field)=>field.sourceField==='Amount')).toMatchObject({value:'amount',dataType:'number'});
    expect(result.find((field)=>field.sourceField==='Active')).toMatchObject({dataType:'boolean'});
    expect(result.find((field)=>field.sourceField==='Invoice Date')).toMatchObject({dataType:'date'});
    expect(result.some((field)=>field.sourceField==='Nested')).toBe(false);
  });

  it('offers type-aware operators without losing numeric comparisons',()=>{
    expect(operatorsForFilterType('string')).toEqual(['EQUALS','NOT_EQUALS','CONTAINS','NOT_CONTAINS','STARTS_WITH','ENDS_WITH','IS_EMPTY','NOT_EMPTY']);
    expect(operatorsForFilterType('number')).toEqual(['EQUALS','NOT_EQUALS','GREATER_THAN','GREATER_OR_EQUAL','LESS_THAN','LESS_OR_EQUAL','IS_EMPTY','NOT_EMPTY']);
    expect(operatorsForFilterType('boolean')).toEqual(['EQUALS','NOT_EQUALS']);
    expect(operatorsForFilterType('date')).toContain('GREATER_THAN');
  });

  it('coerces number and boolean compare values to typed values',()=>{
    expect(coerceFilterValue('12.5','number')).toBe(12.5);
    expect(coerceFilterValue('true','boolean')).toBe(true);
    expect(coerceFilterValue('Freight','string')).toBe('Freight');
  });
});
