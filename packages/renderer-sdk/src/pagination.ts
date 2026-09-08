/** Renderer-agnostic pagination primitives shared by PDF and HTML print paths. */
export const PAGINATION_SAFETY_GAP_MM = 3;
export const PAGINATION_EPSILON_MM = 0.1;
export const HTML_PAGINATION_PARITY_TOLERANCE_MM = 2;

export type PaginationPageKind = 'FIRST' | 'MIDDLE' | 'LAST';

export interface PaginationPolicy {
  safetyGapMm: number;
  epsilonMm: number;
  keepTableFooterWithLastRow: boolean;
  keepGroupSubtotalWithLastRow: boolean;
  trailingBlockMode: 'ATOMIC' | 'ALLOW_SPLIT';
  minimumFillPercent?: number;
  emergencySplitEnabled?: boolean;
}

export const DEFAULT_PAGINATION_POLICY: PaginationPolicy = {
  safetyGapMm: PAGINATION_SAFETY_GAP_MM,
  epsilonMm: PAGINATION_EPSILON_MM,
  keepTableFooterWithLastRow: true,
  keepGroupSubtotalWithLastRow: true,
  trailingBlockMode: 'ATOMIC',
  minimumFillPercent: 20,
  emergencySplitEnabled: false,
};

export interface PageCapacityInput {
  pageHeight: number;
  topMargin: number;
  bottomMargin: number;
  repeatedHeaderHeight: number;
  repeatedFooterHeight: number;
  safetyGap: number;
}

export interface PageCapacity extends PageCapacityInput {
  usableBodyHeight: number;
}

export function resolvePageCapacity(input: PageCapacityInput): PageCapacity {
  return {
    ...input,
    usableBodyHeight: Math.max(
      0,
      input.pageHeight
        - input.topMargin
        - input.bottomMargin
        - input.repeatedHeaderHeight
        - input.repeatedFooterHeight
        - input.safetyGap,
    ),
  };
}

export type PaginationItemKind =
  | 'TABLE_ROW'
  | 'TABLE_FOOTER'
  | 'GROUP_SUBTOTAL'
  | 'BLOCK'
  | 'TRAILING_BLOCK'
  | 'CUSTOM_GRID_ROW';

export interface PaginationItem<T = unknown> {
  id: string;
  kind: PaginationItemKind;
  height: number;
  payload?: T;
  keepWithNextHeight?: number;
  keepTogether?: boolean;
  breakBefore?: boolean;
  breakAfter?: boolean;
}

export interface PlannedPage<T = unknown> {
  pageNumber: number;
  items: PaginationItem<T>[];
  bodyHeightUsed: number;
  capacity: PageCapacity;
}

export function requiredPlacementHeight(
  currentHeight: number,
  requiredFollowupHeight: number,
  safetyGap: number,
): number {
  return currentHeight + requiredFollowupHeight + safetyGap;
}

export function canPlace(
  remainingHeight: number,
  currentHeight: number,
  requiredFollowupHeight: number,
  safetyGap: number,
  epsilon = 0,
): boolean {
  return requiredPlacementHeight(currentHeight, requiredFollowupHeight, safetyGap)
    <= remainingHeight + epsilon;
}

export interface PaginateOptions<T = unknown> {
  policy?: Partial<PaginationPolicy>;
  capacityResolver: (pageIndex: number, kind: PaginationPageKind) => PageCapacity;
  /** Override when caller knows a page is the actual last page during a second pass. */
  pageKindResolver?: (pageIndex: number, itemIndex: number, itemCount: number) => PaginationPageKind;
  onOversizeItem?: (item: PaginationItem<T>, capacity: PageCapacity) => void;
}

/**
 * Pure planner. It is intentionally renderer-agnostic: no DOM, PDF, canvas or font APIs.
 * Renderers measure first, map to PaginationItem[], call this planner, then draw/build DOM.
 */
export function paginate<T = unknown>(
  items: PaginationItem<T>[],
  options: PaginateOptions<T>,
): PlannedPage<T>[] {
  const policy: PaginationPolicy = { ...DEFAULT_PAGINATION_POLICY, ...(options.policy ?? {}) };
  const pages: PlannedPage<T>[] = [];
  let pageIndex = 0;
  let pageKind: PaginationPageKind = 'FIRST';
  let capacity = options.capacityResolver(pageIndex, pageKind);
  let page: PlannedPage<T> = { pageNumber: 1, items: [], bodyHeightUsed: 0, capacity };

  const commitPage = () => {
    if (page.items.length) pages.push(page);
    pageIndex = pages.length;
    pageKind = 'MIDDLE';
    capacity = options.capacityResolver(pageIndex, pageKind);
    page = { pageNumber: pageIndex + 1, items: [], bodyHeightUsed: 0, capacity };
  };

  for (let index = 0; index < items.length; index++) {
    const item = items[index]!;
    if (item.breakBefore && page.items.length) commitPage();

    const remaining = page.capacity.usableBodyHeight - page.bodyHeightUsed;
    const followup = Math.max(0, item.keepWithNextHeight ?? 0);
    const required = requiredPlacementHeight(item.height, followup, policy.safetyGapMm);

    if (required > page.capacity.usableBodyHeight + policy.epsilonMm) {
      options.onOversizeItem?.(item, page.capacity);
      if (item.keepTogether && !policy.emergencySplitEnabled) {
        throw new Error(`PAGINATION_ITEM_EXCEEDS_PAGE:${item.id}`);
      }
    }

    if (!canPlace(remaining, item.height, followup, policy.safetyGapMm, policy.epsilonMm) && page.items.length) {
      commitPage();
    }

    page.items.push(item);
    page.bodyHeightUsed += item.height;

    if (item.breakAfter && index < items.length - 1) commitPage();
  }

  if (page.items.length) pages.push(page);

  // Re-resolve capacities for actual LAST page. This does not move items; consumers that
  // reserve a distinct last-page region can run paginate() again as the second planning pass.
  if (pages.length) {
    pages.forEach((planned, i) => {
      const kind: PaginationPageKind = options.pageKindResolver
        ? options.pageKindResolver(i, i, pages.length)
        : i === 0 && pages.length === 1 ? 'LAST' : i === 0 ? 'FIRST' : i === pages.length - 1 ? 'LAST' : 'MIDDLE';
      planned.capacity = options.capacityResolver(i, kind);
    });
  }

  return pages;
}

export function mmToCssPx(mm: number): number {
  return mm * 96 / 25.4;
}

export interface StablePaginateOptions<T = unknown> extends PaginateOptions<T> {
  maxPasses?: number;
}

/**
 * Re-plans after LAST-page capacity is known. This closes the common gap where a
 * first pass is planned with FIRST/MIDDLE capacities and the actual last page
 * later reserves a different footer/header region. The function stops when page
 * membership stabilizes or after maxPasses.
 */
export function paginateStable<T = unknown>(
  items: PaginationItem<T>[],
  options: StablePaginateOptions<T>,
): PlannedPage<T>[] {
  const maxPasses = Math.max(2, options.maxPasses ?? 4);
  let lastPageCount = 1;
  const seen = new Map<string, PlannedPage<T>[]>();
  let planned: PlannedPage<T>[] = [];

  for (let pass = 0; pass < maxPasses; pass++) {
    planned = paginate(items, {
      ...options,
      pageKindResolver: undefined,
      capacityResolver: (pageIndex, provisionalKind) => {
        const kind: PaginationPageKind = lastPageCount === 1
          ? 'LAST'
          : pageIndex === 0
            ? 'FIRST'
            : pageIndex === lastPageCount - 1
              ? 'LAST'
              : provisionalKind;
        return options.capacityResolver(pageIndex, kind);
      },
    });

    const signature = planned.map(page => page.items.map(item => item.id).join(',')).join('|');

    // Seeing a signature we already produced in an earlier pass means the fixed-point
    // iteration has started cycling instead of converging. This happens specifically on
    // N-page <-> 1-page transitions: page-index-0's FIRST/LAST classification depends on
    // the *previous* pass's page count rather than the plan the current pass actually
    // produced, so two mutually-exclusive layouts keep re-triggering each other forever.
    // Break the cycle by keeping the plan with the most pages: more pages means a
    // tighter (safer) capacity assumption was used, so content is guaranteed to fit;
    // fewer pages risks silently overflowing the real last-page region.
    if (seen.has(signature)) {
      let best = planned;
      for (const candidate of seen.values()) if (candidate.length > best.length) best = candidate;
      return best;
    }
    seen.set(signature, planned);
    lastPageCount = Math.max(1, planned.length);
  }

  // No convergence within maxPasses: fall back to the safest (most-paginated) candidate
  // seen rather than trusting whichever pass happened to run last.
  let best = planned;
  for (const candidate of seen.values()) if (candidate.length > best.length) best = candidate;
  return best;
}
