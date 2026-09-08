import { describe, expect, it } from 'vitest';
import { formatDisplayValue, displayString } from '../src/display-format.js';

describe('Phase 4.11 global display formatting', () => {
  it('preserves native RAW scalar types', () => {
    expect(formatDisplayValue(2)).toBe(2);
    expect(formatDisplayValue(false)).toBe(false);
    expect(formatDisplayValue(0)).toBe(0);
  });
  it('formats fractional and whole percentages', () => {
    expect(displayString(.18,{type:'PERCENT',percentInputMode:'FRACTION',decimals:0})).toBe('18%');
    expect(displayString(18,{type:'PERCENT',percentInputMode:'WHOLE',decimals:0})).toBe('18%');
  });
  it('supports null, boolean and custom formatting', () => {
    expect(displayString(null,{type:'NUMBER',nullDisplay:'-'})).toBe('-');
    expect(displayString(false,{type:'BOOLEAN',trueLabel:'YES',falseLabel:'NO'})).toBe('NO');
    expect(displayString('ABC',{type:'CUSTOM',customPattern:'Ref: {value}'})).toBe('Ref: ABC');
  });
  it('supports date and currency formatting without throwing', () => {
    expect(displayString('2026-08-22T00:00:00Z',{type:'DATE',dateStyle:'ISO'})).toBe('2026-08-22');
    expect(displayString(125000.5,{type:'CURRENCY',currencySymbol:'₹',decimals:2})).toContain('₹');
  });
});
