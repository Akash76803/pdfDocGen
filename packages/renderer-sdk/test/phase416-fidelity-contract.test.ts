import { describe, expect, it } from 'vitest';
import { isFinancialDisplayValue, resolveBlockFrame, resolveFidelityColumnWidths, resolvePageGeometry, semanticColumnWeight } from '../src/fidelity.js';

describe('Phase 4.16 shared renderer fidelity contract',()=>{
  it('resolves page geometry from one physical contract',()=>{
    const geometry=resolvePageGeometry({size:'A4',orientation:'PORTRAIT',margins:{top:10,right:12,bottom:14,left:16}});
    expect(geometry.widthMm).toBe(210);
    expect(geometry.heightMm).toBe(297);
    expect(geometry.contentWidthMm).toBe(182);
    expect(geometry.contentHeightMm).toBe(273);
  });

  it('resolves aligned block width once without squaring width percent',()=>{
    const frame=resolveBlockFrame(500,40,'RIGHT',2,1,3,4);
    expect(frame.width).toBe(200);
    expect(frame.x).toBe(301);
    expect(frame.marginTop).toBe(3);
  });

  it('keeps configured table width exact while respecting auto-column minimums',()=>{
    const widths=resolveFidelityColumnWidths([
      {widthPercent:16,minWidth:70},
      {widthPercent:12,minWidth:45},
      {minWidth:90,weight:1.25},
      {minWidth:70,weight:.75},
      {minWidth:70,weight:.75},
      {minWidth:58,weight:.75},
      {minWidth:95,weight:1.25},
    ],600);
    expect(widths.reduce((a,b)=>a+b,0)).toBeCloseTo(600,6);
    expect(widths.every(v=>v>0)).toBe(true);
  });

  it('classifies currency and numeric displays as no-wrap financial values',()=>{
    for(const value of ['₹9,588.15','Rs. 862.93','INR 47.20','18.00%','11314.02']) expect(isFinancialDisplayValue(value)).toBe(true);
    expect(isFinancialDisplayValue('Product Description')).toBe(false);
    expect(semanticColumnWeight('Product Name')).toBeGreaterThan(semanticColumnWeight('GST'));
  });
});
