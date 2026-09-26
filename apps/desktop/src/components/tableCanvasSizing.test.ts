import { describe, expect, it } from 'vitest';
import { measuredTableHeight } from './tableCanvasSizing.js';

describe('Custom Table intrinsic height', () => {
  it('shrinks away stale resizable wrapper blank space', () => {
    expect(measuredTableHeight('custom', 84.2, 0, 260, 84)).toBe(85);
  });
  it('accounts for column editor ruler only when visible', () => {
    expect(measuredTableHeight('custom', 84, 18, 260, 84)).toBe(102);
  });
  it('maintains dynamic table overflow/pagination measurement', () => {
    expect(measuredTableHeight('dynamic', 84, 0, 260, 84)).toBe(260);
  });
  it('keeps minimum height for selection handles', () => {
    expect(measuredTableHeight('custom', 12, 0, 260, 12)).toBe(32);
  });
});
