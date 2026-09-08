import { describe, expect, it } from 'vitest';
import { inferCsvValue, inferExcelValue, mergeFieldTypes } from '../src/inference.js';

describe('datatype inference', () => {
  it('infers numbers, decimals and negatives', () => {
    expect(inferCsvValue('123')).toEqual({ value: 123, type: 'number' });
    expect(inferCsvValue('12.50')).toEqual({ value: 12.5, type: 'number' });
    expect(inferCsvValue('-9')).toEqual({ value: -9, type: 'number' });
  });

  it('preserves leading-zero identifiers', () => {
    expect(inferCsvValue('00123')).toEqual({ value: '00123', type: 'string' });
  });

  it('infers booleans and null', () => {
    expect(inferCsvValue('TRUE')).toEqual({ value: true, type: 'boolean' });
    expect(inferCsvValue('')).toEqual({ value: null, type: 'null' });
  });

  it('uses conservative date detection', () => {
    expect(inferCsvValue('2026-08-20').type).toBe('date');
    expect(inferCsvValue('2026-08-20T10:30:00Z').type).toBe('datetime');
    expect(inferCsvValue('2024').type).toBe('number');
    expect(inferCsvValue('not-a-date').type).toBe('string');
  });

  it('preserves native Excel types', () => {
    expect(inferExcelValue(42).type).toBe('number');
    expect(inferExcelValue(true).type).toBe('boolean');
    expect(inferExcelValue(new Date(2026, 7, 20)).type).toBe('date');
  });

  it('merges mixed types conservatively', () => {
    expect(mergeFieldTypes(['null', 'number', 'number'])).toBe('number');
    expect(mergeFieldTypes(['number', 'string'])).toBe('string');
  });
});
