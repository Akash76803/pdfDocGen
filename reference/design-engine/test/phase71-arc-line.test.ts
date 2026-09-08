import { describe, expect, it } from 'vitest';
import type { PathGeometry } from '@document-tool/contracts';
import { flipArc, lineToArc, lineToCurve } from '../src/index.js';

const geometry = (): PathGeometry => ({ points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 30, y: 0 }], segments: [{ id: 'line', type: 'LINE', fromPointId: 'a', toPointId: 'b' }], closed: false });

describe('Phase 7.1 line conversion', () => {
  it('converts a line to a cubic curve without moving endpoints or mutating source', () => {
    const source = geometry(); const result = lineToCurve(source, 'line');
    expect(source).toEqual(geometry()); expect(result.segments[0]?.type).toBe('CUBIC_BEZIER');
    expect(result.points.map(({ x, y }) => ({ x, y }))).toEqual(source.points.map(({ x, y }) => ({ x, y })));
    expect(result.points[0]?.outHandle).toBeDefined(); expect(result.points[1]?.inHandle).toBeDefined();
  });

  it('creates and flips a canonical cubic arc while keeping endpoints fixed', () => {
    const source = geometry(); const arc = lineToArc(source, 'line'); const flipped = flipArc(arc, 'line');
    expect(source).toEqual(geometry()); expect(arc.segments[0]?.type).toBe('CUBIC_BEZIER');
    expect(flipped.points.map(({ x, y }) => ({ x, y }))).toEqual(source.points.map(({ x, y }) => ({ x, y })));
    expect(flipped.points[0]?.outHandle?.y).toBeCloseTo(-(arc.points[0]?.outHandle?.y ?? 0));
    expect(arc).not.toEqual(flipped);
  });
});
