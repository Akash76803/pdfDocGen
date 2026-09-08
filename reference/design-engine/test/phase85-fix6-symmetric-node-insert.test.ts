import { describe, expect, it } from 'vitest';
import { insertPathNodeWithSymmetry } from '../src/pathUtils.js';
import type { PathGeometry } from '@document-tool/contracts';

function rectangle(): PathGeometry {
  return {
    closed: true,
    points: [
      { id: 'a', x: 0, y: 0, mode: 'CORNER' },
      { id: 'b', x: 20, y: 0, mode: 'CORNER' },
      { id: 'c', x: 20, y: 30, mode: 'CORNER' },
      { id: 'd', x: 0, y: 30, mode: 'CORNER' },
    ],
    segments: [
      { id: 'top', type: 'LINE', fromPointId: 'a', toPointId: 'b' },
      { id: 'right', type: 'LINE', fromPointId: 'b', toPointId: 'c' },
      { id: 'bottom', type: 'LINE', fromPointId: 'c', toPointId: 'd' },
      { id: 'left', type: 'LINE', fromPointId: 'd', toPointId: 'a' },
    ],
  };
}

describe('Phase 8.5 Fix6 symmetric node insertion', () => {
  it('auto-creates a left/right counterpart at identical Y in H mode', () => {
    const result = insertPathNodeWithSymmetry(rectangle(), 'left', 0.25, 'H', { x: 10, y: 15 }, 1.25);
    expect(result.insertedPointIds).toHaveLength(2);
    expect(result.mirroredCreated).toBe(true);
    const points = result.geometry.points.filter(point => result.insertedPointIds.includes(point.id));
    expect(points[0].y).toBeCloseTo(points[1].y, 6);
    expect(points[0].x + points[1].x).toBeCloseTo(20, 6);
  });

  it('auto-creates a top/bottom counterpart at identical X in V mode', () => {
    const result = insertPathNodeWithSymmetry(rectangle(), 'top', 0.3, 'V', { x: 10, y: 15 }, 1.25);
    expect(result.insertedPointIds).toHaveLength(2);
    const points = result.geometry.points.filter(point => result.insertedPointIds.includes(point.id));
    expect(points[0].x).toBeCloseTo(points[1].x, 6);
    expect(points[0].y + points[1].y).toBeCloseTo(30, 6);
  });

  it('keeps OFF mode as single-node insertion', () => {
    const result = insertPathNodeWithSymmetry(rectangle(), 'left', 0.5, 'OFF', { x: 10, y: 15 }, 1.25);
    expect(result.insertedPointIds).toHaveLength(1);
    expect(result.mirroredCreated).toBe(false);
  });
});
