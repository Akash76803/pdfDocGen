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

  it('supports first-page and except-first header/footer policies', () => {
    expect(resolvePaginationPolicy({ headerMode: 'FIRST_PAGE_ONLY', footerMode: 'FIRST_PAGE_ONLY' })).toMatchObject({
      headerMode: 'FIRST_PAGE_ONLY', footerMode: 'FIRST_PAGE_ONLY', repeatHeader: false,
    });
    expect(resolvePaginationPolicy({ headerMode: 'EXCEPT_FIRST', footerMode: 'EXCEPT_FIRST' })).toMatchObject({
      headerMode: 'EXCEPT_FIRST', footerMode: 'EXCEPT_FIRST', repeatHeader: false,
    });
  });

  it('defaults to repeated header/footer and page numbers', () => {
    const value = resolvePaginationPolicy();
    expect(value.repeatHeader).toBe(true);
    expect(value.footerMode).toBe('REPEAT_PAGE');
    expect(value.showPageNumbers).toBe(true);
  });
});
