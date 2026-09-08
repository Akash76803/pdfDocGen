import type { PaginationSettings } from '@document-tool/contracts';

export type ResolvedFooterMode = 'REPEAT_PAGE'|'FLOW'|'LAST_PAGE_ONLY';

export interface ResolvedPaginationPolicy {
  repeatHeader: boolean;
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
  return {
    repeatHeader: settings?.repeatHeader ?? true,
    footerMode,
    showPageNumbers: settings?.showPageNumbers ?? true,
    keepSummaryTogether: settings?.keepSummaryTogether ?? true,
    keepCustomGridTogether: settings?.keepCustomGridTogether ?? true,
  };
}
