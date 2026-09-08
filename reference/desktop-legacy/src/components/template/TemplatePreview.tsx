import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  Alignment,
  BlockAlignment,
  FontFamily,
  RenderBlock,
  RenderModel,
  RequiredBlockLayout,
  RequiredTextStyle,
  VerticalAlignment,
} from '@document-tool/contracts';
import { DEFAULT_PAGINATION_POLICY, isFinancialDisplayValue, mmToCssPx, paginateStable, resolvePageGeometry, type PageCapacity, type PaginationItem } from '@document-tool/renderer-sdk';

function getPreviewPageDimensions(page: NonNullable<RenderModel['page']>) {
  const geometry = resolvePageGeometry(page);
  return {
    widthMm: geometry.widthMm,
    heightMm: geometry.heightMm,
    mt: geometry.marginTopMm,
    mr: geometry.marginRightMm,
    mb: geometry.marginBottomMm,
    ml: geometry.marginLeftMm,
  };
}

export type PreviewPagePlan = {
  body: RenderBlock[];
  usedPx: number;
};

function emptyPreviewPage(): PreviewPagePlan {
  return { body: [], usedPx: 0 };
}

function outerHeightPx(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.height + (Number.parseFloat(style.marginTop) || 0) + (Number.parseFloat(style.marginBottom) || 0);
}

function fragmentTableBlock(
  block: Extract<RenderBlock, { type: 'TABLE' }>,
  rows: number[],
  includeFooter: boolean,
  fragmentIndex: number,
  fragmentCount: number,
): Extract<RenderBlock, { type: 'TABLE' }> {
  return {
    ...block,
    id: `${block.id}__preview_page_${fragmentIndex + 1}`,
    rows: rows.map((index) => block.rows[index]!),
    empty: rows.length === 0 && block.empty,
    footerRows: includeFooter ? block.footerRows : [],
    layout: {
      ...block.layout,
      marginTop: fragmentIndex === 0 ? block.layout.marginTop : 0,
      marginBottom: fragmentIndex === fragmentCount - 1 ? block.layout.marginBottom : 0,
      breakBefore: false,
      breakAfter: false,
    },
  };
}

export async function buildPaginatedPreviewPlan(root: HTMLElement, model: RenderModel): Promise<PreviewPagePlan[]> {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(images.map(async (image) => {
    try {
      if (typeof image.decode === 'function') await image.decode();
      else if (!image.complete) await new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    } catch { /* fallback/placeholder already participates in layout */ }
  }));

  const paper = root.querySelector<HTMLElement>('.paper-page');
  const flow = paper?.querySelector<HTMLElement>(':scope > .screen-document-flow');
  const header = flow?.querySelector<HTMLElement>(':scope > .paper-header');
  const body = flow?.querySelector<HTMLElement>(':scope > .paper-body');
  const footer = flow?.querySelector<HTMLElement>(':scope > .paper-footer');
  if (!paper || !flow || !body) return [{ body: model.body ?? [], usedPx: 0 }];

  const geometry = resolvePageGeometry(model.page ?? { size: 'A4', orientation: 'PORTRAIT', margins: { top:15,right:15,bottom:15,left:15 } });
  const pageHeightPx = mmToCssPx(geometry.heightMm);
  const topMarginPx = mmToCssPx(geometry.marginTopMm);
  const bottomMarginPx = mmToCssPx(geometry.marginBottomMm);
  const safetyGapPx = mmToCssPx(DEFAULT_PAGINATION_POLICY.safetyGapMm);
  const epsilonPx = mmToCssPx(DEFAULT_PAGINATION_POLICY.epsilonMm);
  const headerHeightPx = header?.getBoundingClientRect().height ?? 0;
  const footerHeightPx = footer?.getBoundingClientRect().height ?? 0;
  const pagination = model.page?.pagination ?? {};
  const repeatHeader = pagination.repeatHeader ?? true;
  const footerMode = pagination.footerMode ?? ((pagination.repeatFooter ?? true) ? 'REPEAT_PAGE' : 'FLOW');

  const bodyCapacity = (pageIndex: number) => Math.max(
    0,
    pageHeightPx
      - topMarginPx
      - bottomMarginPx
      - ((repeatHeader || pageIndex === 0) ? headerHeightPx : 0)
      - (footerMode === 'REPEAT_PAGE' ? footerHeightPx : 0)
      - safetyGapPx,
  );

  const blockElements = Array.from(body.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
  const blocks = model.body ?? [];
  const pages: PreviewPagePlan[] = [emptyPreviewPage()];
  const current = () => pages[pages.length - 1]!;
  const pushPage = () => {
    if (current().body.length === 0 && current().usedPx === 0) return;
    pages.push(emptyPreviewPage());
  };

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex]!;
    const element = blockElements[blockIndex];
    if (!element) {
      current().body.push(block);
      continue;
    }

    if (block.layout.breakBefore && current().body.length) pushPage();

    if (block.type === 'TABLE' && !block.empty && block.rows.length > 0) {
      const table = element.querySelector<HTMLTableElement>('table');
      const rowElements = table ? Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody > tr')) : [];
      if (table && rowElements.length === block.rows.length) {
        const headerPx = block.showHeader ? (table.querySelector<HTMLElement>('thead')?.getBoundingClientRect().height ?? 0) : 0;
        const footerRows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tfoot > tr'));
        const footerPx = footerRows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
        const style = window.getComputedStyle(element);
        const marginTopPx = Number.parseFloat(style.marginTop) || 0;
        const marginBottomPx = Number.parseFloat(style.marginBottom) || 0;
        type TablePayload = { kind: 'ROW'; rowIndex: number } | { kind: 'FOOTER' };
        const items: PaginationItem<TablePayload>[] = rowElements.map((row, rowIndex) => ({
          id: `${block.id}:row:${rowIndex}`,
          kind: 'TABLE_ROW',
          height: row.getBoundingClientRect().height,
          keepWithNextHeight: rowIndex === rowElements.length - 1 ? footerPx : 0,
          payload: { kind: 'ROW', rowIndex },
        }));
        if (footerPx > 0) items.push({
          id: `${block.id}:footer`,
          kind: 'TABLE_FOOTER',
          height: footerPx,
          keepTogether: true,
          payload: { kind: 'FOOTER' },
        });

        // If the first row cannot fit in the remainder of a page that already contains
        // earlier blocks, start the table on a fresh physical preview page. This avoids
        // treating a normal continuation as an oversize-row error.
        const firstRowHeight = rowElements[0]?.getBoundingClientRect().height ?? 0;
        const firstFollowup = rowElements.length === 1 ? footerPx : 0;
        const currentRemaining = bodyCapacity(pages.length - 1) - current().usedPx;
        const firstPlacement = marginTopPx + headerPx + firstRowHeight + firstFollowup + safetyGapPx;
        if (current().body.length > 0 && firstPlacement > currentRemaining + epsilonPx) pages.push(emptyPreviewPage());

        const startingGlobalPage = pages.length - 1;
        const availableRowsHeight = (localPageIndex: number) => {
          const globalPageIndex = startingGlobalPage + localPageIndex;
          const used = localPageIndex === 0 ? current().usedPx : 0;
          return Math.max(0, bodyCapacity(globalPageIndex) - used - headerPx - marginTopPx - marginBottomPx);
        };
        const makeCapacity = (usableBodyHeight: number): PageCapacity => ({
          pageHeight: usableBodyHeight,
          topMargin: 0,
          bottomMargin: 0,
          repeatedHeaderHeight: 0,
          repeatedFooterHeight: 0,
          safetyGap: 0,
          usableBodyHeight,
        });
        const planned = paginateStable(items, {
          policy: { ...DEFAULT_PAGINATION_POLICY, safetyGapMm: safetyGapPx, epsilonMm: epsilonPx },
          capacityResolver: (localPageIndex) => makeCapacity(availableRowsHeight(localPageIndex)),
        });

        planned.forEach((plannedPage, fragmentIndex) => {
          if (fragmentIndex > 0) pages.push(emptyPreviewPage());
          const rowIndexes = plannedPage.items
            .filter((item) => item.payload?.kind === 'ROW')
            .map((item) => (item.payload as { kind: 'ROW'; rowIndex: number }).rowIndex);
          const includeFooter = plannedPage.items.some((item) => item.payload?.kind === 'FOOTER');
          const fragment = fragmentTableBlock(block, rowIndexes, includeFooter, fragmentIndex, planned.length);
          current().body.push(fragment);
          current().usedPx += marginTopPx + headerPx + plannedPage.bodyHeightUsed + marginBottomPx;
        });

        if (block.layout.breakAfter && blockIndex < blocks.length - 1) pushPage();
        continue;
      }
    }

    const heightPx = outerHeightPx(element);
    const remaining = bodyCapacity(pages.length - 1) - current().usedPx;
    if (heightPx > remaining + epsilonPx && current().body.length > 0) pages.push(emptyPreviewPage());
    current().body.push(block);
    current().usedPx += heightPx;
    if (block.layout.breakAfter && blockIndex < blocks.length - 1) pushPage();
  }

  // FLOW/LAST_PAGE_ONLY footer is document content, not a repeated reservation. If it
  // cannot fit after the final body block, create one more real preview page for it.
  if (footerMode !== 'REPEAT_PAGE' && footerHeightPx > 0) {
    const remaining = bodyCapacity(pages.length - 1) - current().usedPx;
    if (footerHeightPx > remaining + epsilonPx && current().body.length > 0) pages.push(emptyPreviewPage());
  }

  return pages.length ? pages : [emptyPreviewPage()];
}

function PreviewPhysicalPage({
  model,
  body,
  pageIndex,
  pageCount,
  printMode = false,
}: {
  model: RenderModel;
  body: RenderBlock[];
  pageIndex: number;
  pageCount: number;
  printMode?: boolean;
}) {
  const page = model.page;
  const pagination = page?.pagination ?? {};
  const repeatHeader = pagination.repeatHeader ?? true;
  const footerMode = pagination.footerMode ?? ((pagination.repeatFooter ?? true) ? 'REPEAT_PAGE' : 'FLOW');
  const showHeader = repeatHeader || pageIndex === 0;
  const showFooter = footerMode === 'REPEAT_PAGE' || ((footerMode === 'FLOW' || footerMode === 'LAST_PAGE_ONLY') && pageIndex === pageCount - 1);
  return (
    <div className={`preview-physical-page paper-page${printMode ? ' exact-print-page' : ''}`} data-preview-page={pageIndex + 1} data-print-page={printMode ? pageIndex + 1 : undefined} data-document-export-page={printMode ? pageIndex + 1 : undefined}>
      {page?.border?.enabled && page.border.style !== 'NONE' && <div className="paper-page-border" style={{ inset: `${page.border.offset ?? 4}mm`, border: `${page.border.width ?? 1}pt ${page.border.style === 'DASHED' ? 'dashed' : 'solid'} ${page.border.color ?? '#111827'}` }}/>} 
      {showHeader && <section className="paper-region paper-header">{(model.header ?? []).map(renderBlock)}</section>}
      <section className="paper-region paper-body">{body.map(renderBlock)}</section>
      {showFooter && <section className={`paper-region paper-footer preview-page-footer preview-page-footer-${footerMode.toLowerCase()}`}>{(model.footer ?? []).map(renderBlock)}</section>}
      {!printMode && <div className="preview-page-badge">Page {pageIndex + 1} of {pageCount}</div>}
    </div>
  );
}

export function TemplatePreview({
  model,
  warnings,
  zoomPercent = 100,
  fitToContainer = false,
  onPagePlanChange,
  onActivePageChange,
}: {
  model: RenderModel | null;
  warnings: string[];
  zoomPercent?: number;
  fitToContainer?: boolean;
  onPagePlanChange?: (plan: PreviewPagePlan[]) => void;
  onActivePageChange?: (pageIndex: number) => void;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [pagePlan, setPagePlan] = useState<PreviewPagePlan[]>([]);

  const pageMetrics = useMemo(() => {
    const page = model?.page ?? { size: 'A4' as const, orientation: 'PORTRAIT' as const, margins:{top:15,right:15,bottom:15,left:15} };
    const geometry = resolvePageGeometry(page);
    return { w: geometry.widthMm, h: geometry.heightMm, mt:geometry.marginTopMm, mr:geometry.marginRightMm, mb:geometry.marginBottomMm, ml:geometry.marginLeftMm };
  }, [model?.page]);

  useEffect(() => {
    if (!fitToContainer || !shellRef.current) return;
    const node = shellRef.current;
    const calculate = () => {
      const pxPerMm = 96 / 25.4;
      const availableWidth = Math.max(100, node.clientWidth - 36);
      // Paginated preview intentionally fits one physical page at a time vertically.
      const availableHeight = Math.max(100, node.clientHeight - 52);
      const widthScale = availableWidth / (pageMetrics.w * pxPerMm);
      const heightScale = availableHeight / (pageMetrics.h * pxPerMm);
      setFitScale(Math.max(0.5, Math.min(1.5, widthScale, heightScale)));
    };
    calculate();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calculate) : null;
    observer?.observe(node);
    window.addEventListener('resize', calculate);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', calculate);
    };
  }, [fitToContainer, pageMetrics.h, pageMetrics.w]);

  useLayoutEffect(() => {
    if (!model || !measureRef.current) {
      setPagePlan([]);
      onPagePlanChange?.([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      // Let the browser complete one layout frame before reading row/image dimensions.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!measureRef.current || cancelled) return;
      const plan = await buildPaginatedPreviewPlan(measureRef.current, model);
      if (!cancelled) {
        setPagePlan(plan);
        onPagePlanChange?.(plan);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [model, onPagePlanChange]);

  useEffect(()=>{const root=shellRef.current;if(!root||typeof IntersectionObserver==='undefined')return;const pages=Array.from(root.querySelectorAll<HTMLElement>('.paper-scale-stage'));const ratios=new Map<Element,number>();const observer=new IntersectionObserver(entries=>{for(const entry of entries)ratios.set(entry.target,entry.intersectionRatio);let best=-1,index=0;pages.forEach((page,pageIndex)=>{const ratio=ratios.get(page)??0;if(ratio>best){best=ratio;index=pageIndex;}});onActivePageChange?.(index);},{root,threshold:[0,.25,.5,.75,1]});pages.forEach(page=>observer.observe(page));return()=>observer.disconnect();},[pagePlan.length,onActivePageChange]);

  if (!model) return <div className="template-preview-empty">No valid preview available.</div>;

  const page = model.page;
  const scale = fitToContainer ? fitScale : Math.max(0.5, Math.min(2, zoomPercent / 100));
  const pages = pagePlan.length ? pagePlan : [{ body: model.body ?? [], usedPx: 0 }];
  const style = {
    '--page-width': `${pageMetrics.w}mm`,
    '--page-height': `${pageMetrics.h}mm`,
    '--mt': `${pageMetrics.mt}mm`,
    '--mr': `${pageMetrics.mr}mm`,
    '--mb': `${pageMetrics.mb}mm`,
    '--ml': `${pageMetrics.ml}mm`,
    '--preview-scale': scale,
    '--page-bg': page?.backgroundColor ?? '#FFFFFF',
  } as React.CSSProperties;

  return (
    <div className="template-preview-shell" ref={shellRef}>
      {warnings.length > 0 && (
        <div className="template-preview-warnings">
          {warnings.map((warning, index) => (
            <div key={index}>⚠ {warning}</div>
          ))}
        </div>
      )}
      <div className="preview-page-count">Preview pages: <strong>{pages.length}</strong></div>
      <div className="paginated-preview-stage" style={style}>
        {pages.map((planned, pageIndex) => (
          <div className="paper-scale-stage" key={`preview-page-${pageIndex}`}>
            <PreviewPhysicalPage model={model} body={planned.body} pageIndex={pageIndex} pageCount={pages.length} />
          </div>
        ))}
      </div>
      <div className="preview-pagination-measure-host" ref={measureRef} style={style} aria-hidden="true">
        <PrintableDocument model={model} className="preview-pagination-measure-page" />
      </div>
    </div>
  );
}


export function PaginatedPrintableDocument({
  model,
  pagePlan,
}: {
  model: RenderModel;
  pagePlan: PreviewPagePlan[];
}) {
  const page = model.page;
  const pageMetrics = getPreviewPageDimensions(page ?? { size: 'A4', orientation: 'PORTRAIT', margins: { top:15, right:15, bottom:15, left:15 } });
  const style = {
    '--page-width': `${pageMetrics.widthMm}mm`,
    '--page-height': `${pageMetrics.heightMm}mm`,
    '--mt': `${pageMetrics.mt}mm`,
    '--mr': `${pageMetrics.mr}mm`,
    '--mb': `${pageMetrics.mb}mm`,
    '--ml': `${pageMetrics.ml}mm`,
    '--page-bg': page?.backgroundColor ?? '#FFFFFF',
  } as React.CSSProperties;

  return (
    <div className="exact-paginated-print-document" style={style} data-print-plan-ready={pagePlan.length ? 'true' : 'false'} data-print-page-count={pagePlan.length}>
      <div className="exact-print-pages">
        {pagePlan.map((planned, pageIndex) => (
          <PreviewPhysicalPage
            key={`exact-print-page-${pageIndex}`}
            model={model}
            body={planned.body}
            pageIndex={pageIndex}
            pageCount={pagePlan.length}
            printMode
          />
        ))}
      </div>
    </div>
  );
}


export type CombinedExactPrintDocument = {
  id: string;
  label?: string;
  model: RenderModel;
};

export function CombinedPaginatedPrintableDocument({
  documents,
  onReady,
}: {
  documents: CombinedExactPrintDocument[];
  onReady?: (summary: { documentCount: number; pageCount: number }) => void;
}) {
  const measureRefs = useRef(new Map<string, HTMLDivElement>());
  const [plans, setPlans] = useState<Record<string, PreviewPagePlan[]>>({});

  useLayoutEffect(() => {
    let cancelled = false;
    const run = async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const next: Record<string, PreviewPagePlan[]> = {};
      for (const document of documents) {
        const root = measureRefs.current.get(document.id);
        if (!root || cancelled) return;
        next[document.id] = await buildPaginatedPreviewPlan(root, document.model);
      }
      if (cancelled) return;
      setPlans(next);
      const pageCount = documents.reduce((sum, document) => sum + (next[document.id]?.length ?? 0), 0);
      onReady?.({ documentCount: documents.length, pageCount });
    };
    void run();
    return () => { cancelled = true; };
  }, [documents, onReady]);

  return (
    <div className="combined-exact-print-document" data-combined-document-count={documents.length}>
      <div className="combined-exact-print-measure-host" aria-hidden="true">
        {documents.map((document) => {
          const page = document.model.page;
          const dims = getPreviewPageDimensions(page ?? { size:'A4', orientation:'PORTRAIT', margins:{ top:15, right:15, bottom:15, left:15 } });
          const style = {
            '--page-width': `${dims.widthMm}mm`,
            '--page-height': `${dims.heightMm}mm`,
            '--mt': `${page?.margins.top ?? 15}mm`,
            '--mr': `${page?.margins.right ?? 15}mm`,
            '--mb': `${page?.margins.bottom ?? 15}mm`,
            '--ml': `${page?.margins.left ?? 15}mm`,
            '--page-bg': page?.backgroundColor ?? '#FFFFFF',
          } as React.CSSProperties;
          return (
            <div
              key={`combined-measure-${document.id}`}
              className="combined-exact-print-measure-document"
              style={style}
              ref={(node) => {
                if (node) measureRefs.current.set(document.id, node);
                else measureRefs.current.delete(document.id);
              }}
            >
              <PrintableDocument model={document.model} className="combined-exact-measure-page"/>
            </div>
          );
        })}
      </div>
      <div className="combined-exact-print-pages">
        {documents.map((document) => {
          const plan = plans[document.id];
          if (!plan?.length) return null;
          return (
            <div className="combined-exact-print-invoice" data-document-id={document.id} key={`combined-exact-${document.id}`}>
              <PaginatedPrintableDocument model={document.model} pagePlan={plan}/>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PrintableDocument({ model, className = '' }: { model: RenderModel; className?: string }) {
  const page = model.page;
  const pageMetrics = getPreviewPageDimensions(page ?? { size: 'A4', orientation: 'PORTRAIT', margins: { top:15, right:15, bottom:15, left:15 } });
  const style = {
    '--page-width': `${pageMetrics.widthMm}mm`,
    '--page-height': `${pageMetrics.heightMm}mm`,
    '--mt': `${pageMetrics.mt}mm`,
    '--mr': `${pageMetrics.mr}mm`,
    '--mb': `${pageMetrics.mb}mm`,
    '--ml': `${pageMetrics.ml}mm`,
    '--page-bg': page?.backgroundColor ?? '#FFFFFF',
  } as React.CSSProperties;
  const pagination = page?.pagination ?? {};
  const repeatHeader = pagination.repeatHeader ?? true;
  const footerMode = pagination.footerMode ?? ((pagination.repeatFooter ?? true) ? 'REPEAT_PAGE' : 'FLOW');
  const repeatFooter = footerMode === 'REPEAT_PAGE';
  return (
    <div className={`paper-page ${className}`.trim()} style={style} data-repeat-header={repeatHeader ? 'true' : 'false'} data-repeat-footer={repeatFooter ? 'true' : 'false'} data-keep-summary={pagination.keepSummaryTogether ?? true ? 'true' : 'false'} data-keep-grid={pagination.keepCustomGridTogether ?? true ? 'true' : 'false'}>
      {page?.border?.enabled && page.border.style !== 'NONE' && <div className="paper-page-border" style={{ inset: `${page.border.offset ?? 4}mm`, border: `${page.border.width ?? 1}pt ${page.border.style === 'DASHED' ? 'dashed' : 'solid'} ${page.border.color ?? '#111827'}` }}/>}
      <div className="screen-document-flow">
        <section className="paper-region paper-header">{(model.header ?? []).map(renderBlock)}</section>
        <section className="paper-region paper-body">{(model.body ?? []).map(renderBlock)}</section>
        <section className="paper-region paper-footer">{(model.footer ?? []).map(renderBlock)}</section>
      </div>
      <table className="print-pagination-shell">
        {repeatHeader && <thead><tr><td><section className="paper-region paper-header">{(model.header ?? []).map(renderBlock)}</section></td></tr></thead>}
        <tbody><tr className="print-pagination-body-row"><td>
          {!repeatHeader && <section className="paper-region paper-header">{(model.header ?? []).map(renderBlock)}</section>}
          <section className="paper-region paper-body">{(model.body ?? []).map(renderBlock)}</section>
          {footerMode === 'FLOW' && <section className="paper-region paper-footer paper-footer-flow">{(model.footer ?? []).map(renderBlock)}</section>}
          {footerMode === 'LAST_PAGE_ONLY' && <section className="paper-region paper-footer paper-footer-last-page">{(model.footer ?? []).map(renderBlock)}</section>}
        </td></tr></tbody>
        {repeatFooter && <tfoot><tr><td><section className="paper-region paper-footer">{(model.footer ?? []).map(renderBlock)}</section></td></tr></tfoot>}
      </table>
    </div>
  );
}


function isNumericDisplayValue(value: unknown): boolean { return isFinancialDisplayValue(value); }

function nestedBlockForParent(child: Extract<RenderBlock, { type: 'TEXT' | 'FIELD' | 'TABLE' | 'SUMMARY_TABLE' | 'CUSTOM_TABLE' | 'IMAGE' | 'SPACER' | 'DIVIDER' | 'BOX' }>): RenderBlock {
  const layout = { ...child.layout, widthPercent: 100, alignment: 'LEFT' as const, marginLeft: 0, marginRight: 0 };
  if (child.type === 'TABLE' || child.type === 'SUMMARY_TABLE' || child.type === 'CUSTOM_TABLE') {
    return { ...child, widthPercent: 100, alignment: 'LEFT', layout } as RenderBlock;
  }
  return { ...child, layout } as RenderBlock;
}

function renderBlock(block: RenderBlock) {
  switch (block.type) {
    case 'TEXT':
      return (
        <div key={block.id} style={{ ...layoutCss(block.layout), ...textCss(block.style) }}>
          {block.text}
        </div>
      );
    case 'FIELD':
      return (
        <div
          key={block.id}
          className={`preview-field ${block.layoutMode === 'STACKED' ? 'stacked' : ''}`}
          style={{ ...layoutCss(block.layout), textAlign: align(block.textAlignment), gap: `${block.spacing}mm` }}
        >
          <span style={textCss(block.labelStyle)}>
            {block.label ? `${block.label}${block.layoutMode === 'INLINE' ? ':' : ''}` : ''}
          </span>
          <span style={textCss(block.valueStyle)}>{block.value}</span>
        </div>
      );
    case 'BOX': {
      const style = block.style;
      const width = style.widthMode === 'FIXED_MM' && style.widthMm > 0 ? `${style.widthMm}mm` : style.widthMode === 'PERCENT' ? `${style.widthPercent}%` : undefined;
      const height = style.heightMode === 'FIXED' && style.heightMm > 0 ? `${style.heightMm}mm` : undefined;
      const minHeight = style.heightMode === 'MINIMUM' || style.minHeightMm > 0 ? `${style.minHeightMm}mm` : undefined;
      return <div key={block.id} className="preview-box-block" style={{...layoutCss(block.layout),width:width ?? undefined,maxWidth:'100%',height,minHeight,boxSizing:'border-box',backgroundColor:style.backgroundColor,border:style.border.style==='NONE'?'none':borderCss(style.border),borderRadius:`${style.borderRadiusMm}mm`,padding:paddingCss(style.padding),overflow:style.overflow==='CLIP'?'hidden':'visible',display:'flex',flexDirection:'column',alignItems:style.horizontalAlignment==='CENTER'?'center':style.horizontalAlignment==='RIGHT'?'flex-end':'stretch',justifyContent:style.verticalAlignment==='CENTER'?'center':style.verticalAlignment==='BOTTOM'?'flex-end':'flex-start',breakInside:block.layout.keepTogether?'avoid':undefined}}>
        {block.children.map((child)=>renderBlock(child as RenderBlock))}
      </div>;
    }
    case 'TABLE':
      return (
        <div
          key={block.id}
          className="preview-table-wrap preview-data-table"
          data-block-id={block.id}
          style={layoutCss({ ...block.layout, widthPercent: block.widthPercent, alignment: block.alignment })}
        >
          <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
            {block.showHeader && <thead>
              {(block.headerGroups?.length ?? 0) > 0 && <tr>{renderTableHeaderGroups(block)}</tr>}
              <tr>
                {block.columns.map((column) => (
                  <th
                    key={column.id}
                    style={{
                      ...textCss({ ...block.headerStyle, ...column.headerStyle, alignment: column.headerAlignment }),
                      width: column.widthPercent ? `${column.widthPercent}%` : undefined,
                      border: block.showBorder ? borderCss(block.border) : 'none',
                      padding: paddingCss(block.cellPadding),
                    }}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>}
            <tbody>
              {block.empty ? (
                <tr>
                  <td colSpan={Math.max(1, block.columns.length)} style={{ border: block.showBorder ? borderCss(block.border) : 'none', padding: paddingCss(block.cellPadding) }}>
                    No rows available
                  </td>
                </tr>
              ) : (
                block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, columnIndex) => {
                      const column = block.columns[columnIndex];
                      return (
                        <td
                          key={columnIndex}
                          style={{
                            ...textCss({ ...block.cellStyle, ...column?.cellStyle, alignment: column?.alignment ?? block.cellStyle.alignment }),
                            width: column?.widthPercent ? `${column.widthPercent}%` : undefined,
                            border: block.showBorder ? borderCss(block.border) : 'none',
                            padding: paddingCss(block.cellPadding),
                          }}
                        >
                          {(column?.kind === 'IMAGE' || column?.kind === 'QR') && typeof cell === 'string' && cell ? (
                            <img src={cell} alt={column.kind === 'QR' ? 'QR Code' : column.label} style={{width:`${column.imageWidthMm ?? 18}mm`,height:`${column.imageHeightMm ?? column.imageWidthMm ?? 18}mm`,maxWidth:'100%',objectFit:'contain',display:'block',margin:column.alignment==='CENTER'?'0 auto':column.alignment==='RIGHT'?'0 0 0 auto':'0'}}/>
                          ) : (cell == null ? '' : String(cell))}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
            {block.footerRows.length > 0 && <tfoot>{block.footerRows.map((row) => <tr key={row.id} style={{backgroundColor:row.backgroundColor}}>{renderTableFooterCells(block,row)}</tr>)}</tfoot>}
          </table>
        </div>
      );
    case 'CUSTOM_TABLE': {
      const byPosition = new Map(block.cells.map((cell) => [`${cell.row}:${cell.column}`, cell]));
      const covered = new Set<string>();
      for (const cell of block.cells) {
        for (let r = cell.row; r < cell.row + cell.rowSpan; r++) for (let c = cell.column; c < cell.column + cell.colSpan; c++) {
          if (!(r === cell.row && c === cell.column)) covered.add(`${r}:${c}`);
        }
      }
      const printCollapsibleEmpty = block.cells.every((cell) => {
        const content = cell.content;
        const emptyContent = content.type === 'IMAGE' ? !content.source : content.value == null || String(content.value).trim() === '';
        return emptyContent && (cell.style.minHeight ?? 0) <= 0;
      });
      const single=block.rowCount===1&&block.columnCount===1?block.cells[0]:undefined;
      const customLayout=single?.style.widthMode==='PERCENT'?{...block.layout,widthPercent:single.style.widthPercent,alignment:block.alignment}:block.layout;
      const fixedWidth=single?.style.widthMode==='FIXED_MM'&&single.style.widthMm>0?`${single.style.widthMm}mm`:undefined;
      return (
        <div key={block.id} className={`preview-table-wrap preview-custom-grid ${printCollapsibleEmpty ? 'print-collapsible-empty' : ''}`} style={{...layoutCss({ ...customLayout, widthPercent:single?.style.widthMode==='PERCENT'?single.style.widthPercent:block.widthPercent, alignment:block.alignment }),width:fixedWidth??undefined,maxWidth:'100%'}}>
          <table style={{borderCollapse:'collapse',width:'100%',tableLayout:'fixed'}}>
            <tbody>{Array.from({length:block.rowCount},(_,row)=><tr key={row}>{Array.from({length:block.columnCount},(_,column)=>{
              const key=`${row}:${column}`; if(covered.has(key)) return null; const cell=byPosition.get(key); if(!cell) return <td key={key}/>;
              const content=cell.content;
              return <td key={cell.id} rowSpan={cell.rowSpan} colSpan={cell.colSpan} style={{backgroundColor:cell.style.backgroundColor,border:block.showBorder?(cell.style.border.style==='NONE'?borderCss(block.border):borderCss(cell.style.border)):'none',borderRadius:`${cell.style.borderRadiusMm}mm`,padding:paddingCss(cell.style.padding),minHeight:`${Math.max(cell.style.minHeight,cell.style.minHeightMm)}mm`,height:cell.style.heightMode==='FIXED'&&cell.style.heightMm>0?`${cell.style.heightMm}mm`:undefined,textAlign:align(cell.style.horizontalAlignment),verticalAlign:cell.style.verticalAlignment==='CENTER'?'middle':cell.style.verticalAlignment==='BOTTOM'?'bottom':'top',overflow:cell.style.overflow==='CLIP'?'hidden':'visible'}}>
                {content.type==='IMAGE' ? (content.sourceType==='DATA_URL' && content.source ? <img src={content.source} alt={content.altText??''} style={{width:`${content.width??30}mm`,height:content.maintainAspectRatio?'auto':content.height?`${content.height}mm`:'auto',maxWidth:'100%',objectFit:content.maintainAspectRatio?'contain':'fill'}}/> : <span className="preview-image-placeholder">{content.altText??'Image'}</span>) : (()=>{const value=content.value==null?'':String(content.value);const numeric=isNumericDisplayValue(value);return <span style={{...textCss(content.style),display:'block',maxWidth:'100%',whiteSpace:numeric?'nowrap':'normal',overflowWrap:numeric?'normal':'break-word',wordBreak:'normal'}}>{value}</span>})()}
              </td>;
            })}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    case 'SUMMARY_TABLE':
      return (
        <div key={block.id} className="preview-table-wrap preview-summary-table" style={layoutCss({ ...block.layout, widthPercent:block.widthPercent, alignment:block.alignment })}>
          {block.title && <div className="preview-summary-title" style={{...textCss({...block.headerStyle,alignment:'LEFT'}),marginBottom:'1mm'}}>{block.title}</div>}
          <table style={{borderCollapse:'collapse',width:'100%',tableLayout:'auto'}}>
            {block.showHeader && <thead><tr>{block.columns.map((column)=><th key={column.id} style={{...textCss({...block.headerStyle,...column.style,alignment:column.headerAlignment}),width:column.widthPercent?`${column.widthPercent}%`:undefined,border:block.showBorder ? borderCss(block.border) : 'none',padding:paddingCss(block.cellPadding),overflowWrap:'normal',wordBreak:'normal'}}>{column.label}</th>)}</tr></thead>}
            <tbody>{block.rows.map((row)=><tr key={row.id} style={{backgroundColor:row.backgroundColor}}>{block.columns.map((column)=>{const cell=row.cells.find((item)=>item.columnId===column.id);const value=cell?String(cell.value):'';const numeric=isNumericDisplayValue(value);return <td key={column.id} style={{...textCss({...row.style,...column.style,...cell?.style,alignment:cell?.alignment ?? column.alignment}),border:block.showBorder ? borderCss(block.border) : 'none',padding:paddingCss(block.cellPadding),fontWeight:row.bold?700:undefined,whiteSpace:numeric?'nowrap':'normal',overflowWrap:numeric?'normal':'break-word',wordBreak:numeric?'normal':'normal'}}>{value}</td>})}</tr>)}</tbody>
            {block.totalRow && <tfoot><tr style={{backgroundColor:block.totalRow.backgroundColor}}>{block.columns.map((column)=>{const cell=block.totalRow!.cells.find((item)=>item.columnId===column.id);const value=cell?String(cell.value):'';const numeric=isNumericDisplayValue(value);return <td key={column.id} style={{...textCss({...block.totalRow!.style,...column.style,...cell?.style,alignment:cell?.alignment ?? column.alignment}),border:block.showBorder ? borderCss(block.border) : 'none',padding:paddingCss(block.cellPadding),fontWeight:700,whiteSpace:numeric?'nowrap':'normal',overflowWrap:numeric?'normal':'break-word',wordBreak:'normal'}}>{value}</td>})}</tr></tfoot>}
          </table>
        </div>
      );
    case 'SPACER':
      return <div key={block.id} style={{ ...layoutCss(block.layout), height: `${block.height}mm` }} />;
    case 'DIVIDER':
      return (
        <div key={block.id} style={layoutCss(block.layout)}>
          <hr
            style={{
              border: 0,
              borderTop: block.style === 'NONE' ? 'none' : `${block.thickness}pt ${block.style === 'DASHED' ? 'dashed' : 'solid'} ${block.color}`,
              margin: 0,
            }}
          />
        </div>
      );
    case 'IMAGE':
      return (
        <div key={block.id} style={{ ...layoutCss(block.layout), display: 'flex', justifyContent: flexAlign(block.alignment) }}>
          {block.sourceType === 'DATA_URL' ? (
            <img
              src={block.source}
              alt={block.altText}
              onError={(event) => {
                event.currentTarget.style.display = 'none';
                event.currentTarget.nextElementSibling?.removeAttribute('hidden');
              }}
              style={{
                width: `${block.width}mm`,
                height: block.maintainAspectRatio ? 'auto' : block.height ? `${block.height}mm` : 'auto',
                maxWidth: '100%',
                objectFit: block.maintainAspectRatio ? 'contain' : 'fill',
              }}
            />
          ) : (
            <div className="preview-image-placeholder">Local asset: {block.altText}</div>
          )}
          <div hidden className="preview-image-placeholder">Image unavailable</div>
        </div>
      );
    case 'ROW':
      return (
        <div key={block.id} className="preview-row-outer" style={layoutCss(block.layout)}>
          <div className="preview-row" style={{ display: 'flex', gap: `${block.gap}mm`, alignItems: verticalAlign(block.verticalAlignment), width: '100%' }}>
            {block.columns.length > 0 ? block.columns.map((column) => (
              <div key={column.id} className="preview-grid-cell" style={{
                ...rowColumnCss(column), minWidth: 0, minHeight: `${column.style.minHeight}mm`,
                backgroundColor: column.style.backgroundColor, border: borderCss(column.style.border),
                padding: paddingCss(column.style.padding), boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
                alignItems: flexAlign(column.style.horizontalAlignment), justifyContent: verticalAlign(column.style.verticalAlignment),
              }}>
                {column.children.length ? column.children.map((child) => <div key={child.id} className="preview-grid-cell-content" style={{width:'100%'}}>{renderRowChild(child)}</div>) : <div className="preview-cell-empty">Blank cell</div>}
              </div>
            )) : block.children.map((child) => (
              <div key={child.id} className="preview-row-child" style={{ width: `${child.layout.widthPercent}%`, minWidth: 0 }}>
                {renderRowChild(child)}
              </div>
            ))}
          </div>
        </div>
      );
  }
}


function rowColumnCss(column: Extract<RenderBlock, { type: 'ROW' }>['columns'][number]): React.CSSProperties {
  const mode = column.style.widthMode;
  if (mode === 'FIXED_MM') {
    return { width: `${column.style.widthMm}mm`, flex: `0 0 ${column.style.widthMm}mm` };
  }
  if (mode === 'PERCENT') {
    const pct = column.style.widthPercent || column.widthPercent;
    // flex-shrink keeps legacy percentage rows safe when a configured gap is present.
    return { width: `${pct}%`, flex: `0 1 ${pct}%` };
  }
  // AUTO is the renderer-neutral FLEX mode for Row columns.
  return { width: 'auto', flex: '1 1 0' };
}


function renderTableFooterCells(block: Extract<RenderBlock,{type:'TABLE'}>,row: Extract<RenderBlock,{type:'TABLE'}>['footerRows'][number]) {
  const out:ReactNode[]=[];let col=0;
  for(const cell of row.cells){const found=cell.columnId?block.columns.findIndex(c=>c.id===cell.columnId):-1;const target=found>=0?Math.max(col,found):col;if(target>col){out.push(<td key={`gap-${cell.id}`} colSpan={target-col} style={{border:block.showBorder?borderCss(block.border):'none',padding:paddingCss(block.cellPadding)}}/>);col=target;}const span=Math.min(Math.max(1,cell.colspan),Math.max(1,block.columns.length-col));out.push(<td key={cell.id} colSpan={span} style={{...textCss({...row.style,...cell.style,alignment:cell.alignment}),border:block.showBorder?borderCss(block.border):'none',padding:paddingCss(block.cellPadding)}}>{String(cell.value)}</td>);col+=span;}
  if(col<block.columns.length)out.push(<td key={`tail-${row.id}`} colSpan={block.columns.length-col} style={{border:block.showBorder?borderCss(block.border):'none',padding:paddingCss(block.cellPadding)}}/>);
  return out;
}

function renderTableHeaderGroups(block: Extract<RenderBlock,{type:'TABLE'}>) {
  const byStart=new Map((block.headerGroups ?? []).map((group)=>[group.startColumnId,group]));
  const covered=new Set<string>();
  const cells:ReactNode[]=[];
  for(let i=0;i<block.columns.length;i++){
    const column=block.columns[i]!;
    if(covered.has(column.id)) continue;
    const group=byStart.get(column.id);
    if(group){
      const span=Math.min(group.colspan,block.columns.length-i);
      for(let j=1;j<span;j++) covered.add(block.columns[i+j]!.id);
      cells.push(<th key={group.id} colSpan={span} style={{...textCss({...block.headerStyle,...group.style,alignment:group.alignment}),border:block.showBorder?borderCss(block.border):'none',padding:paddingCss(block.cellPadding)}}>{group.label}</th>);
    }else cells.push(<th key={`blank-${column.id}`} style={{border:block.showBorder?borderCss(block.border):'none',padding:paddingCss(block.cellPadding)}}/>);
  }
  return cells;
}

function renderRowChild(child: Extract<RenderBlock, { type: 'TEXT' | 'FIELD' | 'TABLE' | 'SUMMARY_TABLE' | 'CUSTOM_TABLE' | 'IMAGE' | 'SPACER' | 'DIVIDER' | 'BOX' }>) {
  return renderBlock(nestedBlockForParent(child));
}

function align(value: Alignment | undefined): 'left' | 'center' | 'right' {
  return value === 'CENTER' ? 'center' : value === 'RIGHT' ? 'right' : 'left';
}

function flexAlign(value: BlockAlignment | undefined) {
  return value === 'CENTER' ? 'center' : value === 'RIGHT' ? 'flex-end' : 'flex-start';
}

function verticalAlign(value: VerticalAlignment | undefined) {
  return value === 'CENTER' ? 'center' : value === 'BOTTOM' ? 'flex-end' : 'flex-start';
}

function layoutCss(layout: RequiredBlockLayout): React.CSSProperties {
  return {
    width: `${layout.widthPercent}%`,
    marginLeft: layout.alignment === 'CENTER' || layout.alignment === 'RIGHT' ? 'auto' : `${layout.marginLeft}mm`,
    marginRight: layout.alignment === 'CENTER' ? 'auto' : layout.alignment === 'RIGHT' ? `${layout.marginRight}mm` : 'auto',
    marginTop: `${layout.marginTop}mm`,
    marginBottom: `${layout.marginBottom}mm`,
    breakInside: layout.keepTogether ? 'avoid' : 'auto',
    pageBreakInside: layout.keepTogether ? 'avoid' : 'auto',
    breakBefore: layout.breakBefore ? 'page' : 'auto',
    pageBreakBefore: layout.breakBefore ? 'always' : 'auto',
    breakAfter: layout.breakAfter ? 'page' : 'auto',
    pageBreakAfter: layout.breakAfter ? 'always' : 'auto',
  };
}

const FONT_STACK: Record<FontFamily, string> = {
  Arial: 'Arial, sans-serif',
  Calibri: 'Calibri, Arial, sans-serif',
  'Times New Roman': '"Times New Roman", Times, serif',
  Georgia: 'Georgia, serif',
  Verdana: 'Verdana, sans-serif',
  Tahoma: 'Tahoma, sans-serif',
  'Courier New': '"Courier New", monospace',
  'Segoe UI': '"Segoe UI", Arial, sans-serif',
  'system-ui': 'system-ui, sans-serif',
  'sans-serif': 'sans-serif',
  serif: 'serif',
  monospace: 'monospace',
};

function textCss(style: RequiredTextStyle): React.CSSProperties {
  return {
    fontFamily: FONT_STACK[style.fontFamily],
    fontSize: `${style.fontSize}pt`,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
    textAlign: align(style.alignment),
    color: style.textColor,
    backgroundColor: style.backgroundColor,
    lineHeight: style.lineHeight,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  };
}

function borderCss(border: { width: number; color: string; style: string }) {
  return border.style === 'NONE' ? 'none' : `${border.width}pt ${border.style === 'DASHED' ? 'dashed' : 'solid'} ${border.color}`;
}

function paddingCss(padding: { top: number; right: number; bottom: number; left: number }) {
  return `${padding.top}mm ${padding.right}mm ${padding.bottom}mm ${padding.left}mm`;
}
