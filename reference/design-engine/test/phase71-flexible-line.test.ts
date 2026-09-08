import { describe, expect, it } from 'vitest';
import type { PathDesignElement } from '@document-tool/contracts';
import { lineToCurve, validatePathGeometry } from '../src/index.js';

const flexibleLine = (): PathDesignElement => ({
  id: 'flex', type: 'PATH', name: 'Flexible Line', position: { xMm: 0, yMm: 0 }, size: { widthMm: 30, heightMm: 20 }, rotationDeg: 0, opacity: 1, visible: true, locked: false, zIndex: 0,
  geometry: { points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 10 }, { id: 'c', x: 30, y: 5 }], segments: [{ id: 'ab', type: 'LINE', fromPointId: 'a', toPointId: 'b' }, { id: 'bc', type: 'LINE', fromPointId: 'b', toPointId: 'c' }], closed: false },
  fill: { type: 'NONE' }, stroke: { type: 'SOLID', style: 'SOLID', color: '#000000', widthMm: 0.5 }
});

describe('Phase 7.1 Flexible Line', () => {
  it('uses canonical open PATH geometry with multiple points and stroke-only defaults', () => {
    const element = flexibleLine();
    expect(element.type).toBe('PATH'); expect(element.geometry.closed).toBe(false);
    expect(element.geometry.points).toHaveLength(3); expect(element.fill.type).toBe('NONE');
    expect(element.stroke.widthMm).toBeGreaterThan(0); expect(validatePathGeometry(element.geometry)).toBe(true);
  });

  it('reuses normal path segment conversion', () => {
    const element = flexibleLine(); const converted = lineToCurve(element.geometry, 'ab');
    expect(converted.segments[0]?.type).toBe('CUBIC_BEZIER'); expect(converted.closed).toBe(false);
    expect(element.geometry.segments[0]?.type).toBe('LINE');
  });
});
