import { describe,expect,it } from 'vitest';
import { sanitizeTargetSegment,suggestMapping } from '../src/suggestions.js';
describe('mapping suggestions sanitizer',()=>{
  it.each([
    ['Supplier Code*','supplierCode'],['Supplier Name*','supplierName'],['GST Number','gstNumber'],['Invoice No.','invoiceNo']
  ])('sanitizes %s',(source,expected)=>expect(sanitizeTargetSegment(source)).toBe(expected));
  it('produces a valid generic path without changing source label',()=>expect(suggestMapping('Supplier Code*').path).toBe('fields.supplierCode'));
});

describe('summary role suggestions',()=>{
  it('suggests row-varying invoice totals as summary fields',()=>{
    const s=suggestMapping('SGST Amount',true);
    expect(s.role).toBe('SUMMARY_FIELD'); expect(s.summaryAggregation).toBe('SUM');
  });
});
