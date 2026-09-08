import type { RenderModel } from '@document-tool/contracts';
import { getPageDimensions } from '@document-tool/contracts';
import { DEFAULT_PAGINATION_POLICY, HTML_PAGINATION_PARITY_TOLERANCE_MM, mmToCssPx, paginateStable, type PageCapacity, type PaginationItem } from '@document-tool/renderer-sdk';

const BREAK_CLASS = 'print-force-break-before';

/**
 * Pre-pagination pass for the exact HTML print path.
 * It measures the already-rendered print DOM (after images decode), uses the same
 * renderer-agnostic planner as the low-level PDF adapter, then annotates the
 * rows where the browser must start a new printed page.
 */
export async function prepareHtmlPrintPagination(root: HTMLElement, model: RenderModel): Promise<void> {
  root.classList.add('is-measuring-print');
  try {
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map(async (image) => {
      try {
        const canDecode = typeof (image as { decode?: () => Promise<void> }).decode === 'function';
        if (canDecode) await image.decode();
        else if (!image.complete) await new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        });
      } catch { /* image fallback is handled by preview */ }
    }));

    root.querySelectorAll(`.${BREAK_CLASS}`).forEach((node) => node.classList.remove(BREAK_CLASS));

    const page = root.querySelector<HTMLElement>('.paper-page');
    if (!page) return;
    const dims = getPageDimensions(model.page ?? { size: 'A4', orientation: 'PORTRAIT' });
    const pageHeightPx = mmToCssPx(dims.heightMm);
    const margins = model.page?.margins ?? { top: 15, right: 15, bottom: 15, left: 15 };
    const repeatHeader = model.page?.pagination?.repeatHeader ?? true;
    const footerMode = model.page?.pagination?.footerMode ?? ((model.page?.pagination?.repeatFooter ?? true) ? 'REPEAT_PAGE' : 'FLOW');
    const shell = root.querySelector<HTMLElement>('.print-pagination-shell');
    const shellHead = shell?.querySelector<HTMLElement>(':scope > thead');
    const shellFoot = shell?.querySelector<HTMLElement>(':scope > tfoot');
    const repeatedHeaderHeight = repeatHeader ? (shellHead?.getBoundingClientRect().height ?? 0) : 0;
    const repeatedFooterHeight = footerMode === 'REPEAT_PAGE' ? (shellFoot?.getBoundingClientRect().height ?? 0) : 0;
    const safetyGapPx = mmToCssPx(DEFAULT_PAGINATION_POLICY.safetyGapMm);
    const epsilonPx = mmToCssPx(DEFAULT_PAGINATION_POLICY.epsilonMm);

    const tables = Array.from(root.querySelectorAll<HTMLElement>('.preview-data-table'));
    for (const wrap of tables) {
      const table = wrap.querySelector<HTMLTableElement>('table');
      if (!table) continue;
      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody > tr'));
      if (!rows.length) continue;
      const footerRows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tfoot > tr'));
      const footerHeight = footerRows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
      const tableHeaderHeight = table.querySelector<HTMLElement>('thead')?.getBoundingClientRect().height ?? 0;
      const pageRect = page.getBoundingClientRect();
      const firstRowRect = rows[0]!.getBoundingClientRect();
      const firstRowTopInPage = firstRowRect.top - pageRect.top;
      const bodyBottom = pageHeightPx - mmToCssPx(margins.bottom) - repeatedFooterHeight - safetyGapPx;
      const firstRowsCapacity = Math.max(0, bodyBottom - firstRowTopInPage);
      const continuationRowsCapacity = Math.max(
        0,
        pageHeightPx
          - mmToCssPx(margins.top)
          - mmToCssPx(margins.bottom)
          - repeatedHeaderHeight
          - repeatedFooterHeight
          - tableHeaderHeight
          - safetyGapPx,
      );

      type Payload = { kind: 'ROW'; element: HTMLTableRowElement } | { kind: 'FOOTER'; element: HTMLTableRowElement };
      const items: PaginationItem<Payload>[] = rows.map((row, index) => ({
        id: `html-row-${index}`,
        kind: 'TABLE_ROW',
        height: row.getBoundingClientRect().height,
        keepWithNextHeight: index === rows.length - 1 ? footerHeight : 0,
        payload: { kind: 'ROW', element: row },
      }));
      footerRows.forEach((row, index) => items.push({
        id: `html-footer-${index}`,
        kind: 'TABLE_FOOTER',
        height: row.getBoundingClientRect().height,
        keepTogether: true,
        payload: { kind: 'FOOTER', element: row },
      }));

      const capacity = (height: number): PageCapacity => ({
        pageHeight: height,
        topMargin: 0,
        bottomMargin: 0,
        repeatedHeaderHeight: 0,
        repeatedFooterHeight: 0,
        safetyGap: safetyGapPx,
        usableBodyHeight: height,
      });

      const plan = paginateStable(items, {
        policy: {
          ...DEFAULT_PAGINATION_POLICY,
          safetyGapMm: safetyGapPx,
          epsilonMm: epsilonPx,
        },
        capacityResolver: (pageIndex) => capacity(pageIndex === 0 ? firstRowsCapacity : continuationRowsCapacity),
      });

      plan.slice(1).forEach((planned) => {
        const first = planned.items.find((item) => item.payload?.kind === 'ROW');
        if (first?.payload?.kind === 'ROW') first.payload.element.classList.add(BREAK_CLASS);
      });

      wrap.dataset.paginationParityToleranceMm = String(HTML_PAGINATION_PARITY_TOLERANCE_MM);
      wrap.dataset.prePaginated = 'true';
    }
  } finally {
    root.classList.remove('is-measuring-print');
  }
}
