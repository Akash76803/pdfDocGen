import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGINATION_POLICY, HTML_PAGINATION_PARITY_TOLERANCE_MM, PAGINATION_EPSILON_MM, PAGINATION_SAFETY_GAP_MM, canPlace, resolvePageCapacity } from '../src/pagination.js';

describe('Phase 4.8 freeze constants and capacities',()=>{
  it('locks production pagination constants',()=>{
    expect(PAGINATION_SAFETY_GAP_MM).toBe(3);
    expect(PAGINATION_EPSILON_MM).toBe(.1);
    expect(HTML_PAGINATION_PARITY_TOLERANCE_MM).toBe(2);
    expect(DEFAULT_PAGINATION_POLICY.trailingBlockMode).toBe('ATOMIC');
    expect(DEFAULT_PAGINATION_POLICY.minimumFillPercent).toBe(20);
    expect(DEFAULT_PAGINATION_POLICY.emergencySplitEnabled).toBe(false);
  });
  it('reserves header footer margins and safety gap',()=>{
    expect(resolvePageCapacity({pageHeight:297,topMargin:12,bottomMargin:12,repeatedHeaderHeight:25,repeatedFooterHeight:10,safetyGap:3}).usableBodyHeight).toBe(235);
  });
  it('uses epsilon at exact page boundary',()=>{
    expect(canPlace(100,100.05,0,0,.1)).toBe(true);
    expect(canPlace(100,100.2,0,0,.1)).toBe(false);
  });
});
