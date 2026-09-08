import { describe, expect, it } from 'vitest';
import { processHeaders } from '../src/headers.js';

describe('header processing', () => {
  it('trims normal headers', () => {
    const result = processHeaders([' Name ', 'Amount']);
    expect(result.headers.map((h) => h.key)).toEqual(['Name', 'Amount']);
  });

  it('deduplicates repeated headers', () => {
    const result = processHeaders(['Name', 'Name', 'Name']);
    expect(result.headers.map((h) => h.key)).toEqual(['Name', 'Name_2', 'Name_3']);
    expect(result.warnings.filter((w) => w.code === 'DUPLICATE_HEADER')).toHaveLength(2);
  });

  it('fills blank headers deterministically', () => {
    const result = processHeaders(['', 'Amount', '  ']);
    expect(result.headers.map((h) => h.key)).toEqual(['Column_1', 'Amount', 'Column_3']);
    expect(result.headers[0]?.originalLabel).toBe('');
    expect(result.warnings.filter((w) => w.code === 'BLANK_HEADER')).toHaveLength(2);
  });
});
