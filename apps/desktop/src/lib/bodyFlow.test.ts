import { describe, expect, it } from 'vitest';
import { contentBoundsPx, defaultPageSettings } from './pageModel.ts';
import { layoutBodyFlow, materializeBodyFlowPages } from './bodyFlow.ts';

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
});
