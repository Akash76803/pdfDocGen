import { describe, expect, it } from 'vitest';
import { contentBoundsPx, defaultPageSettings, pagePixelSize } from './pageModel.ts';
import { materializeBodyFlowPages } from './bodyFlow.ts';

function fixture(footerEnabled: boolean) {
  const settings = defaultPageSettings();
  settings.footer = { enabled: footerEnabled, heightMm: 28, gapMm: 7, repeat: 'every' };
  const bounds = contentBoundsPx(settings);
  const table = {
    id: 'line-items', type: 'table', region: 'body' as const, layoutMode: 'flow' as const,
    flowRowId: 'items-row', x: 0, y: 0, width: 640, height: 900, flowGapAfterMm: 4,
  };
  const summary = {
    id: 'hsn-summary', type: 'table', region: 'body' as const, layoutMode: 'flow' as const,
    flowRowId: 'summary-row', x: 0, y: 0, width: 640, height: 75, flowGapAfterMm: 0,
  };
  return { settings, bounds, table, summary };
}

describe('footer-aware overflow: forward compatibility for future template footers', () => {
  it('reserves footer height plus footer gap on every continuation page', () => {
    const withFooter = fixture(true);
    const withoutFooter = fixture(false);
    expect(withFooter.bounds.height).toBeLessThan(withoutFooter.bounds.height);
    expect(withFooter.bounds.y + withFooter.bounds.height).toBeLessThan(
      pagePixelSize(withFooter.settings).height - 28,
    );
  });

  it('moves a post-table summary onto a separate page rather than into the future footer', () => {
    const { settings, bounds, table, summary } = fixture(true);
    const result = materializeBodyFlowPages([table, summary], settings, (element) =>
      element.id === table.id
        ? { pageCount: 2, lastPageUsedHeightPx: bounds.height - 35 }
        : undefined,
    );
    const itemsPlacement = result.placements.get(table.id)!;
    const summaryPlacement = result.placements.get(summary.id)!;
    expect(itemsPlacement.endPageIndex).toBe(1);
    expect(summaryPlacement.pageIndex).toBe(2);
    expect(summaryPlacement.y).toBe(bounds.y);
    expect(summaryPlacement.endY).toBeLessThanOrEqual(bounds.y + bounds.height);
    expect(result.pageCount).toBe(3);
  });

  it('keeps the post-table summary above the reserved footer when the final fragment leaves enough space', () => {
    const { settings, bounds, table, summary } = fixture(true);
    const result = materializeBodyFlowPages([table, summary], settings, (element) =>
      element.id === table.id
        ? { pageCount: 2, lastPageUsedHeightPx: 140 }
        : undefined,
    );
    const summaryPlacement = result.placements.get(summary.id)!;
    expect(summaryPlacement.pageIndex).toBe(1);
    expect(summaryPlacement.endY).toBeLessThanOrEqual(bounds.y + bounds.height);
  });
});
