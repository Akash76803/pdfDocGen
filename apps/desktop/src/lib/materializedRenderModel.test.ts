import { describe, expect, it } from 'vitest';
import { defaultPageSettings } from './pageModel.ts';
import { buildMaterializedRenderDocument } from './materializedRenderModel.ts';

describe('DB-4.5A materialized render model', () => {
  it('preserves builder page and continuation order in one document sequence', () => {
    const a = defaultPageSettings();
    const b = defaultPageSettings();
    b.orientation = 'Landscape';
    const model = buildMaterializedRenderDocument('Invoice', [
      { id: 'p1', name: 'Invoice', settings: a, outputPageCount: 3 },
      { id: 'p2', name: 'Terms', settings: b, outputPageCount: 1 },
    ]);
    expect(model.totalPages).toBe(4);
    expect(model.pages.map((p) => [p.builderPageId, p.continuationIndex, p.documentPageIndex])).toEqual([
      ['p1', 0, 0], ['p1', 1, 1], ['p1', 2, 2], ['p2', 0, 3],
    ]);
    expect(model.pages[3]?.widthMm).toBeGreaterThan(model.pages[3]?.heightMm ?? 0);
  });
});
