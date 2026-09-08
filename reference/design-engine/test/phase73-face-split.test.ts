import { describe, expect, it } from 'vitest';
import type { PathDesignElement } from '@document-tool/contracts';
import { createShapeElement, splitClosedElementByDivider } from '../src/index.js';

const rectangle = () => createShapeElement('RECTANGLE', {
  id: 'rect',
  name: 'Rectangle',
  xMm: 10,
  yMm: 10,
  widthMm: 40,
  heightMm: 30,
  zIndex: 3
});

const divider = (): PathDesignElement => ({
  id: 'divider',
  type: 'PATH',
  name: 'Divider',
  position: { xMm: 10, yMm: 10 },
  size: { widthMm: 40, heightMm: 30 },
  rotationDeg: 0,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 4,
  geometry: {
    points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 40, y: 30 }],
    segments: [{ id: 'ab', type: 'LINE', fromPointId: 'a', toPointId: 'b' }],
    closed: false
  },
  fill: { type: 'NONE' },
  stroke: { style: 'SOLID', color: '#000000', widthMm: .5 }
});

describe('Phase 7.3 face splitting', () => {
  it('splits a rectangle diagonal into two independent closed canonical faces', () => {
    const faces = splitClosedElementByDivider(rectangle(), divider(), 'component');
    expect(faces).toHaveLength(2);
    expect(faces?.every(face => face.geometry.closed)).toBe(true);
    expect(new Set(faces?.flatMap(face => face.geometry.points.map(point => point.id))).size)
      .toBe(faces?.reduce((sum, face) => sum + face.geometry.points.length, 0));
  });

  it('inherits source style, layer and component identity', () => {
    const source = rectangle();
    const faces = splitClosedElementByDivider(source, divider(), 'component')!;
    expect(faces.every(face => face.groupId === 'component')).toBe(true);
    expect(faces[0]!.fill).toEqual(source.fill);
    expect(faces[0]!.zIndex).toBe(source.zIndex);
  });

  it('does not mutate source geometry during calculation', () => {
    const source = rectangle();
    const snapshot = JSON.stringify(source);
    splitClosedElementByDivider(source, divider(), 'component');
    expect(JSON.stringify(source)).toBe(snapshot);
  });

  it('rejects a divider with only one boundary endpoint', () => {
    const invalid = divider();
    invalid.geometry.points[1] = { ...invalid.geometry.points[1]!, x: 20, y: 15 };
    expect(splitClosedElementByDivider(rectangle(), invalid, 'component')).toBeUndefined();
  });
});
