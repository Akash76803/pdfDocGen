import { contentBoundsPx, mmToPx, type PageSettings } from './pageModel.ts';

export type BodyLayoutMode = 'flow' | 'floating';
export type BodyFlowAlign = 'left' | 'center' | 'right';
export type BodyFlowDistribution = 'packed' | 'space-between' | 'space-around' | 'space-evenly';
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
  flowDistribution?: BodyFlowDistribution;
  flowWidth?: BodyFlowWidth;
  /** Cached derived height for the complete shared Flow row. Every member of the
   * row receives the same value whenever one member's measured height changes.
   * Older templates may omit it; layout always falls back to live member heights. */
  flowRowHeightPx?: number;
};


/**
 * A normal Flow block can physically land on any continuation page after
 * document materialization. Its DOM height is still the authoritative height
 * of the persistent block and must be committed even when pageIndex > 0.
 *
 * Only a virtual fragment of a multi-page Dynamic Table is derived output; its
 * page-local fragment height must never overwrite the logical source element.
 */
export function shouldCommitMeasuredFlowHeight(physicalPageIndex: number, virtualPaginatedFragment: boolean): boolean {
  void physicalPageIndex; // page index is intentionally NOT a restriction.
  return !virtualPaginatedFragment;
}

export function newFlowRowId() {
  return `flow-row-${crypto.randomUUID()}`;
}

export function flowRowKey(element: BodyFlowElement) {
  return element.flowRowId || `legacy-row-${element.id}`;
}

export function effectiveFlowRowHeight<T extends BodyFlowElement>(row: T[]): number {
  if (!row.length) return 0;
  const memberHeight = Math.max(...row.map((element) => Math.max(element.type === 'divider' ? 4 : 20, element.height)));
  const cachedRowHeight = Math.max(0, ...row.map((element) => element.flowRowHeightPx ?? 0));
  return Math.max(memberHeight, cachedRowHeight);
}

/**
 * Rebuild the shared Flow-row height cache from the individual block heights.
 * This is intentionally explicit rather than render-time state mutation: when a
 * table/text block changes measured height, callers update the block and then
 * atomically synchronize its row. The next row therefore always starts below
 * the tallest current member, while shorter side-by-side members keep their own
 * visual height.
 */
export function synchronizeFlowRowHeights<T extends BodyFlowElement>(elements: T[]): T[] {
  const rows = new Map<string, T[]>();
  for (const element of elements) {
    if ((element.region ?? 'body') !== 'body' || (element.layoutMode ?? 'floating') !== 'flow') continue;
    const key = flowRowKey(element);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key)!.push(element);
  }
  const rowHeights = new Map<string, number>();
  for (const [key, row] of rows) {
    // Derive only from each block's own measured height. Do not feed the old
    // cached row height back into itself, otherwise a row could never shrink.
    rowHeights.set(key, Math.max(...row.map((element) => Math.max(element.type === 'divider' ? 4 : 20, element.height))));
  }
  return elements.map((element) => {
    if ((element.region ?? 'body') !== 'body' || (element.layoutMode ?? 'floating') !== 'flow') {
      return element.flowRowHeightPx == null ? element : ({ ...element, flowRowHeightPx: undefined } as T);
    }
    const nextHeight = rowHeights.get(flowRowKey(element));
    if (nextHeight == null || Math.abs((element.flowRowHeightPx ?? -1) - nextHeight) < 0.5) return element;
    return { ...element, flowRowHeightPx: nextHeight } as T;
  });
}

/**
 * Deterministic Body row/block flow.
 * - Flow blocks own no manual Y: rows are laid out from the usable Body top.
 * - A row may contain multiple horizontal blocks.
 * - Row height is the tallest rendered block in that row.
 * - Any block height change therefore pushes every following row automatically.
 * - Floating blocks keep explicit X/Y and do not reserve flow space.
 */

/**
 * Move a complete Flow row up/down as one logical unit.
 *
 * The persisted element array is also the row-order source for layoutBodyFlow.
 * Reordering only one member of a shared row breaks that contract because the
 * row's members become interleaved with another row. This helper therefore
 * reorders the flattened Flow sequence by whole row, then writes that sequence
 * back into the existing Flow slots so floating/non-body elements keep their
 * relative positions.
 */
export function moveFlowRow<T extends BodyFlowElement>(elements: T[], selectedId: string, direction: -1 | 1): T[] {
  const flowSlots = elements
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => (element.region ?? 'body') === 'body' && (element.layoutMode ?? 'floating') === 'flow');
  const selected = flowSlots.find(({ element }) => element.id === selectedId)?.element;
  if (!selected) return elements;

  const rowOrder: string[] = [];
  const rowMembers = new Map<string, T[]>();
  for (const { element } of flowSlots) {
    const key = flowRowKey(element);
    if (!rowMembers.has(key)) { rowMembers.set(key, []); rowOrder.push(key); }
    rowMembers.get(key)!.push(element);
  }

  const selectedRow = flowRowKey(selected);
  const rowAt = rowOrder.indexOf(selectedRow);
  const targetAt = rowAt + direction;
  if (rowAt < 0 || targetAt < 0 || targetAt >= rowOrder.length) return elements;

  [rowOrder[rowAt], rowOrder[targetAt]] = [rowOrder[targetAt], rowOrder[rowAt]];
  const reorderedFlow = rowOrder.flatMap((rowId) => rowMembers.get(rowId) ?? []);
  const next = [...elements];
  flowSlots.forEach(({ index }, i) => { next[index] = reorderedFlow[i]; });
  return synchronizeFlowRowHeights(next);
}

export function layoutBodyFlow<T extends BodyFlowElement>(elements: T[], settings: PageSettings): T[] {
  const bounds = contentBoundsPx(settings);
  const flow = elements.filter((e) => (e.region ?? 'body') === 'body' && (e.layoutMode ?? 'floating') === 'flow');
  const rowOrder: string[] = [];
  const rows = new Map<string, T[]>();
  for (const element of flow) {
    const rowId = flowRowKey(element);
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
    const totalPct = requested.reduce((a, b) => a + b, 0);
    const scale = totalPct > 100 ? 100 / totalPct : 1;
    const distribution = row.length > 1 ? (row[0]?.flowDistribution ?? 'packed') : 'packed';
    let widths: number[];
    let x: number;
    let resolvedGap = columnGap;

    if (distribution === 'packed') {
      const gapTotal = Math.max(0, row.length - 1) * columnGap;
      const available = Math.max(20, bounds.width - gapTotal);
      widths = requested.map((pct) => available * ((pct * scale) / 100));
      const occupied = widths.reduce((a, b) => a + b, 0) + gapTotal;
      x = rowAlign === 'center' ? bounds.x + Math.max(0, (bounds.width - occupied) / 2) : rowAlign === 'right' ? bounds.x + Math.max(0, bounds.width - occupied) : bounds.x;
    } else {
      // Distribution modes deliberately use each block's percentage against the
      // complete usable Body width. The leftover horizontal space is then
      // distributed by the row, which makes layouts such as 35% + 35% naturally
      // anchor to opposite edges without a fake spacer element.
      widths = requested.map((pct) => bounds.width * ((pct * scale) / 100));
      const occupiedWidth = widths.reduce((a, b) => a + b, 0);
      const free = Math.max(0, bounds.width - occupiedWidth);
      if (distribution === 'space-between') {
        resolvedGap = row.length > 1 ? free / (row.length - 1) : 0;
        x = bounds.x;
      } else if (distribution === 'space-around') {
        resolvedGap = row.length > 0 ? free / row.length : 0;
        x = bounds.x + resolvedGap / 2;
      } else {
        resolvedGap = free / (row.length + 1);
        x = bounds.x + resolvedGap;
      }
    }
    const rowHeight = effectiveFlowRowHeight(row);

    row.forEach((element, i) => {
      const width = widths[i];
      projectedById.set(element.id, { ...element, x, y: cursorY, width } as T);
      x += width + resolvedGap;
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
    const rowId = flowRowKey(item);
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
    const rowId = flowRowKey(element);
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
    const rowHeight = effectiveFlowRowHeight(row);

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
