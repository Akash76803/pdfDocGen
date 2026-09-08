import { describe, expect, it } from 'vitest';
import { resolvePaginationPolicy } from '../src/pagination-policy.js';

describe('Phase 4.4 pagination policy', () => {
  it('keeps legacy repeatFooter templates backward compatible', () => {
    expect(resolvePaginationPolicy({ repeatFooter: true }).footerMode).toBe('REPEAT_PAGE');
    expect(resolvePaginationPolicy({ repeatFooter: false }).footerMode).toBe('FLOW');
  });
  it('prefers explicit footerMode over the legacy flag', () => {
    expect(resolvePaginationPolicy({ repeatFooter: true, footerMode: 'LAST_PAGE_ONLY' }).footerMode).toBe('LAST_PAGE_ONLY');
  });
  it('defaults to repeated header/footer and page numbers', () => {
    const value = resolvePaginationPolicy();
    expect(value.repeatHeader).toBe(true);
    expect(value.footerMode).toBe('REPEAT_PAGE');
    expect(value.showPageNumbers).toBe(true);
  });
});
