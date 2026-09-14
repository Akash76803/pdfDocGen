import type { PaginationSettings } from '@document-tool/contracts';

export type ResolvedHeaderMode = 'EVERY_PAGE'|'FIRST_PAGE_ONLY'|'EXCEPT_FIRST';
export type ResolvedFooterMode = 'REPEAT_PAGE'|'FLOW'|'LAST_PAGE_ONLY'|'FIRST_PAGE_ONLY'|'EXCEPT_FIRST';

export interface ResolvedPaginationPolicy {
  repeatHeader: boolean;
  headerMode: ResolvedHeaderMode;
  footerMode: ResolvedFooterMode;
  showPageNumbers: boolean;
  keepSummaryTogether: boolean;
  keepCustomGridTogether: boolean;
}

/**
 * Central pagination policy resolver used by the PDF renderer.
 * Legacy repeatFooter is intentionally supported so saved Phase 4.3 templates
 * do not change behavior after upgrading to the explicit footer modes.
 */
export function resolvePaginationPolicy(settings?: PaginationSettings): ResolvedPaginationPolicy {
  const footerMode: ResolvedFooterMode = settings?.footerMode
    ?? ((settings?.repeatFooter ?? true) ? 'REPEAT_PAGE' : 'FLOW');
  const headerMode: ResolvedHeaderMode = settings?.headerMode
    ?? ((settings?.repeatHeader ?? true) ? 'EVERY_PAGE' : 'FIRST_PAGE_ONLY');
  return {
    repeatHeader: headerMode === 'EVERY_PAGE',
    headerMode,
    footerMode,
    showPageNumbers: settings?.showPageNumbers ?? true,
    keepSummaryTogether: settings?.keepSummaryTogether ?? true,
    keepCustomGridTogether: settings?.keepCustomGridTogether ?? true,
  };
}
