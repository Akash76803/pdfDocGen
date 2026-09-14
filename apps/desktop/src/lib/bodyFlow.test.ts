import { describe, expect, it } from 'vitest';
import { contentBoundsPx, defaultPageSettings } from './pageModel.ts';
import { layoutBodyFlow, materializeBodyFlowPages, moveFlowRow, shouldCommitMeasuredFlowHeight, synchronizeFlowRowHeights } from './bodyFlow.ts';

describe('body flow layout', () => {
  it('pushes later flow blocks down when an earlier block grows', () => {
    const settings = defaultPageSettings();
    const first = { id: 'a', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, x: 0, y: 0, width: 100, height: 100, flowGapAfterMm: 4 };
    const second = { id: 'b', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, x: 0, y: 0, width: 100, height: 80, flowGapAfterMm: 4 };
    const before = layoutBodyFlow([first, second], settings);
    const after = layoutBodyFlow([{ ...first, height: 180 }, second], settings);
    expect(after[1].y).toBeGreaterThan(before[1].y);
    expect(after[1].y - before[1].y).toBe(80);
  });

  it('does not reserve flow space for floating blocks', () => {
    const settings = defaultPageSettings();
    const first = { id: 'a', type: 'text', region: 'body' as const, layoutMode: 'flow' as const, x: 0, y: 0, width: 100, height: 40 };
    const floating = { id: 'f', type: 'shape', region: 'body' as const, layoutMode: 'floating' as const, x: 500, y: 500, width: 200, height: 300 };
    const second = { id: 'b', type: 'text', region: 'body' as const, layoutMode: 'flow' as const, x: 0, y: 0, width: 100, height: 40 };
    const projected = layoutBodyFlow([first, floating, second], settings);
    expect(projected[1]).toEqual(floating);
    expect(projected[2].y).toBeLessThan(floating.y);
  });
});

import { insertFlowElementByVisualY } from './bodyFlow.ts';

describe('legacy block conversion order', () => {
  it('keeps a newly converted block below an already-flowing block when its visual Y is lower', () => {
    const settings = defaultPageSettings();
    const text = { id: 'text', type: 'text', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-text', x: 20, y: 110, width: 500, height: 90 };
    const table = { id: 'table', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-table', x: 20, y: 260, width: 500, height: 180 };
    // Persisted order intentionally starts with the table, matching the bug case.
    const inserted = insertFlowElementByVisualY([table, text], table, settings);
    const projected = layoutBodyFlow(inserted, settings);
    const projectedText = projected.find((item) => item.id === 'text')!;
    const projectedTable = projected.find((item) => item.id === 'table')!;
    expect(projectedTable.y).toBeGreaterThan(projectedText.y);
  });
});

describe('materializeBodyFlowPages', () => {
  it('places a following flow block after the final page of a multi-page table', () => {
    const settings = defaultPageSettings();
    const bounds = contentBoundsPx(settings);
    const table = { id: 'table-mp', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-table', x: 0, y: 0, width: 500, height: 500, flowGapAfterMm: 4 };
    const text = { id: 'text-after', type: 'text', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-text', x: 0, y: 0, width: 500, height: 40 };
    const result = materializeBodyFlowPages([table, text], settings, (element) => element.id === table.id ? { pageCount: 2, lastPageUsedHeightPx: 180 } : undefined);
    const tablePlacement = result.placements.get(table.id)!;
    const textPlacement = result.placements.get(text.id)!;
    expect(tablePlacement.pageIndex).toBe(0);
    expect(tablePlacement.endPageIndex).toBe(1);
    expect(textPlacement.pageIndex).toBe(1);
    expect(textPlacement.y).toBeGreaterThan(bounds.y + 180);
    expect(result.pageCount).toBe(2);
  });

  it('uses runtime span height instead of stale logical table height for the following row', () => {
    const settings = defaultPageSettings();
    const bounds = contentBoundsPx(settings);
    const table = { id: 'table-runtime-short', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-table', x: 0, y: 0, width: 500, height: 620, flowRowHeightPx: 620, flowGapAfterMm: 4 };
    const summary = { id: 'summary-after-short', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-summary', x: 0, y: 0, width: 500, height: 70, flowGapAfterMm: 0 };
    const result = materializeBodyFlowPages([table, summary], settings, (element) => element.id === table.id ? { pageCount: 1, lastPageUsedHeightPx: 120 } : undefined);
    const tablePlacement = result.placements.get(table.id)!;
    const summaryPlacement = result.placements.get(summary.id)!;
    expect(tablePlacement.pageIndex).toBe(0);
    expect(summaryPlacement.pageIndex).toBe(0);
    expect(summaryPlacement.y).toBeGreaterThan(bounds.y + 120);
    expect(summaryPlacement.y).toBeLessThan(bounds.y + 200);
  });

  it('uses runtime span height for fit checks so a short invoice table does not jump to a phantom next page', () => {
    const settings = defaultPageSettings();
    const bounds = contentBoundsPx(settings);
    const lead = { id: 'lead', type: 'text', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-lead', x: 0, y: 0, width: 500, height: Math.max(40, bounds.height - 250), flowGapAfterMm: 0 };
    const table = { id: 'table-stale-fit', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-table-fit', x: 0, y: 0, width: 500, height: 500, flowRowHeightPx: 500, flowGapAfterMm: 0 };
    const result = materializeBodyFlowPages([lead, table], settings, (element) => element.id === table.id ? { pageCount: 1, lastPageUsedHeightPx: 100 } : undefined);
    const placement = result.placements.get(table.id)!;
    expect(placement.pageIndex).toBe(0);
    expect(placement.y).toBeLessThan(bounds.y + bounds.height);
  });

  it('moves the next block to another page when the final table fragment leaves insufficient body space', () => {
    const settings = defaultPageSettings();
    const bounds = contentBoundsPx(settings);
    const table = { id: 'table-mp2', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-table', x: 0, y: 0, width: 500, height: 500, flowGapAfterMm: 4 };
    const text = { id: 'text-after2', type: 'text', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-text', x: 0, y: 0, width: 500, height: 80 };
    const almostFull = Math.max(0, bounds.height - 20);
    const result = materializeBodyFlowPages([table, text], settings, (element) => element.id === table.id ? { pageCount: 2, lastPageUsedHeightPx: almostFull } : undefined);
    const textPlacement = result.placements.get(text.id)!;
    expect(textPlacement.pageIndex).toBe(2);
    expect(textPlacement.y).toBe(bounds.y);
    expect(result.pageCount).toBe(3);
  });

  it('uses the tallest member of a shared row and pushes the following row', () => {
    const settings = defaultPageSettings();
    const left = { id: 'left-table', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-shared', flowWidthPercent: 50, x: 0, y: 0, width: 300, height: 90 };
    const right = { id: 'right-table', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-shared', flowWidthPercent: 50, x: 0, y: 0, width: 300, height: 150 };
    const next = { id: 'next-table', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-next', x: 0, y: 0, width: 600, height: 70, flowGapAfterMm: 0 };
    const projected = layoutBodyFlow([left, right, next], settings);
    const projectedLeft = projected.find((item) => item.id === left.id)!;
    const projectedNext = projected.find((item) => item.id === next.id)!;
    expect(projectedNext.y).toBeGreaterThanOrEqual(projectedLeft.y + 150);
  });

  it('synchronizes shared row height after one table grows and allows the row to shrink again', () => {
    const left = { id: 'left-table-sync', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-sync', x: 0, y: 0, width: 300, height: 90 };
    const right = { id: 'right-table-sync', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-sync', x: 0, y: 0, width: 300, height: 110 };
    const grown = synchronizeFlowRowHeights([{ ...left, height: 220 }, right]);
    expect(grown[0].flowRowHeightPx).toBe(220);
    expect(grown[1].flowRowHeightPx).toBe(220);
    const shrunk = synchronizeFlowRowHeights(grown.map((item) => item.id === left.id ? { ...item, height: 80 } : item));
    expect(shrunk[0].flowRowHeightPx).toBe(110);
    expect(shrunk[1].flowRowHeightPx).toBe(110);
  });

});


describe('measured flow height commit policy', () => {
  it('commits a normal Flow table height even when the block is materialized on continuation page 2+', () => {
    expect(shouldCommitMeasuredFlowHeight(0, false)).toBe(true);
    expect(shouldCommitMeasuredFlowHeight(1, false)).toBe(true);
    expect(shouldCommitMeasuredFlowHeight(4, false)).toBe(true);
  });

  it('does not commit a page-local multi-page Dynamic Table fragment height', () => {
    expect(shouldCommitMeasuredFlowHeight(0, true)).toBe(false);
    expect(shouldCommitMeasuredFlowHeight(3, true)).toBe(false);
  });
});


describe('shared Flow row ordering', () => {
  const rowFixture = () => [
    { id: 'top', type: 'text', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-top', x: 0, y: 0, width: 600, height: 40 },
    { id: 'a', type: 'image', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-shared', x: 0, y: 0, width: 180, height: 80 },
    { id: 'b', type: 'text', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-shared', x: 0, y: 0, width: 240, height: 100 },
    { id: 'c', type: 'image', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-shared', x: 0, y: 0, width: 180, height: 80 },
    { id: 'bottom', type: 'table', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-bottom', x: 0, y: 0, width: 600, height: 90 },
  ];

  it('moves all three members of a shared row above the previous row together', () => {
    const moved = moveFlowRow(rowFixture(), 'b', -1);
    const flowIds = moved.filter((item) => item.layoutMode === 'flow').map((item) => item.id);
    expect(flowIds).toEqual(['a', 'b', 'c', 'top', 'bottom']);
    const projected = layoutBodyFlow(moved, defaultPageSettings());
    const a = projected.find((item) => item.id === 'a')!;
    const b = projected.find((item) => item.id === 'b')!;
    const c = projected.find((item) => item.id === 'c')!;
    const top = projected.find((item) => item.id === 'top')!;
    expect(a.y).toBe(b.y);
    expect(b.y).toBe(c.y);
    expect(top.y).toBeGreaterThan(a.y);
  });

  it('moves a complete shared row down without changing member order', () => {
    const moved = moveFlowRow(rowFixture(), 'a', 1);
    const flowIds = moved.filter((item) => item.layoutMode === 'flow').map((item) => item.id);
    expect(flowIds).toEqual(['top', 'bottom', 'a', 'b', 'c']);
  });

  it('keeps floating elements in their existing array slots while moving a Flow row', () => {
    const base = rowFixture();
    const floating = { id: 'float', type: 'shape', region: 'body' as const, layoutMode: 'floating' as const, x: 1, y: 1, width: 20, height: 20 };
    const mixed = [base[0], base[1], floating, base[2], base[3], base[4]];
    const moved = moveFlowRow(mixed, 'b', -1);
    expect(moved[2].id).toBe('float');
    expect(moved.filter((item) => item.layoutMode === 'flow').map((item) => item.id)).toEqual(['a', 'b', 'c', 'top', 'bottom']);
  });
});


describe('Flow row distribution', () => {
  it('anchors two 35% blocks to opposite edges with Space Between', () => {
    const settings = defaultPageSettings();
    const bounds = contentBoundsPx(settings);
    const row = [
      { id: 'left-shape', type: 'shape', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-distribute', flowWidthPercent: 35, flowDistribution: 'space-between' as const, x: 0, y: 0, width: 100, height: 60 },
      { id: 'right-shape', type: 'shape', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-distribute', flowWidthPercent: 35, flowDistribution: 'space-between' as const, x: 0, y: 0, width: 100, height: 60 },
    ];
    const projected = layoutBodyFlow(row, settings);
    expect(projected[0].x).toBeCloseTo(bounds.x, 5);
    expect(projected[1].x + projected[1].width).toBeCloseTo(bounds.x + bounds.width, 5);
    expect(projected[1].x - (projected[0].x + projected[0].width)).toBeGreaterThan(0);
  });

  it('places three blocks with equal outer and inner gaps for Space Evenly', () => {
    const settings = defaultPageSettings();
    const bounds = contentBoundsPx(settings);
    const row = ['a','b','c'].map((id) => ({ id, type: 'shape', region: 'body' as const, layoutMode: 'flow' as const, flowRowId: 'row-even', flowWidthPercent: 20, flowDistribution: 'space-evenly' as const, x: 0, y: 0, width: 100, height: 40 }));
    const projected = layoutBodyFlow(row, settings);
    const outerLeft = projected[0].x - bounds.x;
    const gap1 = projected[1].x - (projected[0].x + projected[0].width);
    const gap2 = projected[2].x - (projected[1].x + projected[1].width);
    const outerRight = bounds.x + bounds.width - (projected[2].x + projected[2].width);
    expect(gap1).toBeCloseTo(outerLeft, 5);
    expect(gap2).toBeCloseTo(outerLeft, 5);
    expect(outerRight).toBeCloseTo(outerLeft, 5);
  });
});
