import { contentBoundsPx, mmToPx, type PageSettings } from './pageModel.ts';

export type BodyLayoutMode = 'flow' | 'floating';
export type BodyFlowAlign = 'left' | 'center' | 'right';
export type BodyFlowWidth = 'full' | 'custom';

export type BodyFlowElement = {
  id: string;
  type: string;
  region?: 'body' | 'header' | 'footer';
  x: number;
  y: number;
  width: number;
  height: number;
  layoutMode?: BodyLayoutMode;
  flowRowId?: string;
  flowWidthPercent?: number;
  flowGapBeforeMm?: number;
  flowGapAfterMm?: number;
  flowColumnGapMm?: number;
  flowAlign?: BodyFlowAlign;
  flowWidth?: BodyFlowWidth;
};

export function newFlowRowId() {
  return `flow-row-${crypto.randomUUID()}`;
}

/**
 * Deterministic Body row/block flow.
 * - Flow blocks own no manual Y: rows are laid out from the usable Body top.
 * - A row may contain multiple horizontal blocks.
 * - Row height is the tallest rendered block in that row.
 * - Any block height change therefore pushes every following row automatically.
 * - Floating blocks keep explicit X/Y and do not reserve flow space.
 */
export function layoutBodyFlow<T extends BodyFlowElement>(elements: T[], settings: PageSettings): T[] {
  const bounds = contentBoundsPx(settings);
  const flow = elements.filter((e) => (e.region ?? 'body') === 'body' && (e.layoutMode ?? 'floating') === 'flow');
  const rowOrder: string[] = [];
  const rows = new Map<string, T[]>();
  for (const element of flow) {
    const rowId = element.flowRowId || `legacy-row-${element.id}`;
    if (!rows.has(rowId)) { rows.set(rowId, []); rowOrder.push(rowId); }
    rows.get(rowId)!.push(element);
  }

  const projectedById = new Map<string, T>();
  let cursorY = bounds.y;
  for (const rowId of rowOrder) {
    const row = rows.get(rowId)!;
    const gapBefore = mmToPx(Math.max(0, Math.max(...row.map((e) => e.flowGapBeforeMm ?? 0))));
    const gapAfter = mmToPx(Math.max(0, Math.max(...row.map((e) => e.flowGapAfterMm ?? 4))));
    const columnGap = mmToPx(Math.max(0, row[0]?.flowColumnGapMm ?? 4));
    const rowAlign = row[0]?.flowAlign ?? 'left';
    cursorY += gapBefore;

    const requested = row.map((e) => Math.min(100, Math.max(5, e.flowWidthPercent ?? (e.flowWidth === 'custom' ? Math.min(100, Math.max(5, (e.width / bounds.width) * 100)) : 100))));
    const gapTotal = Math.max(0, row.length - 1) * columnGap;
    const available = Math.max(20, bounds.width - gapTotal);
    const totalPct = requested.reduce((a, b) => a + b, 0);
    const scale = totalPct > 100 ? 100 / totalPct : 1;
    const widths = requested.map((pct) => available * ((pct * scale) / 100));
    const occupied = widths.reduce((a, b) => a + b, 0) + gapTotal;
    let x = rowAlign === 'center' ? bounds.x + Math.max(0, (bounds.width - occupied) / 2) : rowAlign === 'right' ? bounds.x + Math.max(0, bounds.width - occupied) : bounds.x;
    const rowHeight = Math.max(...row.map((e) => Math.max(e.type === 'divider' ? 4 : 20, e.height)));

    row.forEach((element, i) => {
      const width = widths[i];
      projectedById.set(element.id, { ...element, x, y: cursorY, width } as T);
      x += width + columnGap;
    });
    cursorY += rowHeight + gapAfter;
  }

  return elements.map((element) => projectedById.get(element.id) ?? element);
}


/**
 * Inserts an existing floating Body element into the flow sequence according to
 * its current visual Y position. This keeps legacy pages stable while users
 * convert blocks to Flow one-by-one: an element that is visually below an
 * already-flowing block becomes a later row instead of jumping above it just
 * because it appeared earlier in the persisted element array.
 */
export function insertFlowElementByVisualY<T extends BodyFlowElement>(elements: T[], element: T, settings: PageSettings): T[] {
  const without = elements.filter((item) => item.id !== element.id);
  const flow = without.filter((item) => (item.region ?? 'body') === 'body' && (item.layoutMode ?? 'floating') === 'flow');
  if (!flow.length) return [...without, element];

  const projected = layoutBodyFlow(without, settings);
  const projectedById = new Map(projected.map((item) => [item.id, item]));
  const rows: Array<{ rowId: string; y: number; firstIndex: number; lastIndex: number }> = [];
  const rowMap = new Map<string, { rowId: string; y: number; firstIndex: number; lastIndex: number }>();

  without.forEach((item, index) => {
    if ((item.region ?? 'body') !== 'body' || (item.layoutMode ?? 'floating') !== 'flow') return;
    const rowId = item.flowRowId ?? `legacy-row-${item.id}`;
    const projectedItem = projectedById.get(item.id) ?? item;
    const existing = rowMap.get(rowId);
    if (existing) {
      existing.y = Math.min(existing.y, projectedItem.y);
      existing.lastIndex = index;
      return;
    }
    const row = { rowId, y: projectedItem.y, firstIndex: index, lastIndex: index };
    rowMap.set(rowId, row);
    rows.push(row);
  });

  const targetY = element.y;
  const before = rows.find((row) => row.y > targetY);
  const insertAt = before ? before.firstIndex : rows[rows.length - 1].lastIndex + 1;
  const next = [...without];
  next.splice(insertAt, 0, element);
  return next;
}

export function flowBottom<T extends BodyFlowElement>(elements: T[], settings: PageSettings): number {
  const projected = layoutBodyFlow(elements, settings).filter((item) => (item.region ?? 'body') === 'body' && (item.layoutMode ?? 'floating') === 'flow');
  if (!projected.length) return contentBoundsPx(settings).y;
  return Math.max(...projected.map((item) => item.y + item.height + mmToPx(Math.max(0, item.flowGapAfterMm ?? 4))));
}

export type BodyFlowPageSpan = {
  pageCount: number;
  /** Height consumed by the block on its final materialized page. */
  lastPageUsedHeightPx: number;
};

export type BodyFlowPagePlacement = {
  id: string;
  pageIndex: number;
  y: number;
  endPageIndex: number;
  endY: number;
};

/**
 * DB-4.4 Phase 3 / DB-4B integration.
 * Materializes logical Body-flow rows across output pages. A multi-page block
 * (normally a paginated Dynamic Table) reserves its complete output span, so
 * the next flow row starts only after the block's FINAL fragment, never below
 * its first-page fragment or inside the Footer zone.
 *
 * The resolver is intentionally generic: the table paginator can provide the
 * page span without coupling this layout module to the table model.
 */
export function materializeBodyFlowPages<T extends BodyFlowElement>(
  elements: T[],
  settings: PageSettings,
  resolvePageSpan?: (element: T, pageIndex: number, y: number, availableHeightPx: number, continuationHeightPx: number) => BodyFlowPageSpan | undefined,
): { projected: T[]; placements: Map<string, BodyFlowPagePlacement>; pageCount: number } {
  const projected = layoutBodyFlow(elements, settings);
  const bounds = contentBoundsPx(settings);
  const bottom = bounds.y + bounds.height;
  const flow = projected.filter((e) => (e.region ?? 'body') === 'body' && (e.layoutMode ?? 'floating') === 'flow');

  const rowOrder: string[] = [];
  const rows = new Map<string, T[]>();
  for (const element of flow) {
    const rowId = element.flowRowId || `legacy-row-${element.id}`;
    if (!rows.has(rowId)) { rows.set(rowId, []); rowOrder.push(rowId); }
    rows.get(rowId)!.push(element);
  }

  const placements = new Map<string, BodyFlowPagePlacement>();
  let pageIndex = 0;
  let cursorY = bounds.y;

  for (const rowId of rowOrder) {
    const row = rows.get(rowId)!;
    const gapBefore = mmToPx(Math.max(0, Math.max(...row.map((e) => e.flowGapBeforeMm ?? 0))));
    const gapAfter = mmToPx(Math.max(0, Math.max(...row.map((e) => e.flowGapAfterMm ?? 4))));
    const rowHeight = Math.max(...row.map((e) => Math.max(e.type === 'divider' ? 4 : 20, e.height)));

    cursorY += gapBefore;

    // Normal rows move to the next output page if the complete row cannot fit.
    // Multi-page blocks are allowed to start in the remaining space and their
    // resolver decides how many continuation pages they consume.
    let spans = row.map((element) => resolvePageSpan?.(
      element,
      pageIndex,
      cursorY,
      Math.max(0, bottom - cursorY),
      bounds.height,
    ));
    const hasMultiPageSpan = spans.some((span) => span && span.pageCount > 1);
    if (!hasMultiPageSpan && cursorY + rowHeight > bottom && cursorY > bounds.y) {
      pageIndex += 1;
      cursorY = bounds.y + gapBefore;
      spans = row.map((element) => resolvePageSpan?.(
        element,
        pageIndex,
        cursorY,
        Math.max(0, bottom - cursorY),
        bounds.height,
      ));
    }

    let rowEndPage = pageIndex;
    let rowEndY = cursorY + rowHeight;
    row.forEach((element, index) => {
      const span = spans[index] ?? resolvePageSpan?.(
        element,
        pageIndex,
        cursorY,
        Math.max(0, bottom - cursorY),
        bounds.height,
      );
      const spanPages = Math.max(1, span?.pageCount ?? 1);
      const endPageIndex = pageIndex + spanPages - 1;
      const endY = spanPages > 1
        ? bounds.y + Math.max(0, span?.lastPageUsedHeightPx ?? element.height)
        : cursorY + Math.max(element.type === 'divider' ? 4 : 20, span?.lastPageUsedHeightPx ?? element.height);
      placements.set(element.id, { id: element.id, pageIndex, y: cursorY, endPageIndex, endY });
      if (endPageIndex > rowEndPage || (endPageIndex === rowEndPage && endY > rowEndY)) {
        rowEndPage = endPageIndex;
        rowEndY = endY;
      }
    });

    pageIndex = rowEndPage;
    cursorY = rowEndY + gapAfter;
    // If a complete block ended at/beyond the Body bottom, subsequent content
    // begins at the next page Body start rather than entering the Footer.
    if (cursorY >= bottom) {
      pageIndex += 1;
      cursorY = bounds.y;
    }
  }

  return { projected, placements, pageCount: Math.max(1, pageIndex + 1) };
}
