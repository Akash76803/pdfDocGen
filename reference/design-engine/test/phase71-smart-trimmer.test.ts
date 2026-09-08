import { describe, expect, it } from 'vitest';
import type { PathDesignElement, PathGeometry, ShapeDesignElement } from '@document-tool/contracts';
import { deletePathSegmentRange, erasePathWithWorldStroke, findTrimInterval, getPathRangeBetweenNodes, getSmartTrimIntervals, localToWorld, normalizePathFragment, splitGeometryIntoConnectedFragments, splitPathSegment, trimSegmentInterval, validatePathGeometry } from '../src/index.js';

const stroke = { type: 'SOLID' as const, style: 'SOLID' as const, color: '#000000', widthMm: 0.5 };
const lineGeometry = (): PathGeometry => ({
  points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }],
  segments: [{ id: 'line', type: 'LINE', fromPointId: 'a', toPointId: 'b' }],
  closed: false
});
const lineElement = (): PathDesignElement => ({ id: 'target', type: 'PATH', name: 'Line', position: { xMm: 0, yMm: 20 }, size: { widthMm: 100, heightMm: 1 }, rotationDeg: 0, opacity: 1, visible: true, locked: false, zIndex: 0, geometry: lineGeometry(), fill: { type: 'NONE' }, stroke });
const circleElement = (): ShapeDesignElement => ({ id: 'circle', type: 'SHAPE', name: 'Circle', position: { xMm: 30, yMm: 0 }, size: { widthMm: 40, heightMm: 40 }, rotationDeg: 0, opacity: 1, visible: true, locked: false, zIndex: 1, shape: 'CIRCLE', fill: { type: 'NONE' }, stroke });

describe('Phase 7.1 Smart Trimmer', () => {
  it('erases only the path interval touched by a world-space brush stroke', () => {
    const source = lineElement();
    const snapshot = structuredClone(source);
    const erased = erasePathWithWorldStroke(source, [{ xMm: 50, yMm: 15 }, { xMm: 50, yMm: 25 }], 2);
    const fragments = splitGeometryIntoConnectedFragments(erased);
    expect(source).toEqual(snapshot);
    expect(fragments).toHaveLength(2);
    expect(erased.segments).toHaveLength(2);
    expect(validatePathGeometry(erased)).toBe(true);
    const endpoints = erased.points.map(point => point.x).sort((a, b) => a - b);
    expect(endpoints[0]).toBeCloseTo(0);
    expect(endpoints[1]).toBeLessThan(50);
    expect(endpoints[2]).toBeGreaterThan(50);
    expect(endpoints[3]).toBeCloseTo(100);
  });

  it('detects two crossings and chooses the interval under the pointer', () => {
    const intervals = getSmartTrimIntervals(lineElement(), 'line', [lineElement(), circleElement()]);
    expect(intervals).toHaveLength(3);
    expect(intervals[1]?.segmentId).toBe('line');
    expect(intervals[1]?.tStart).toBeCloseTo(0.3, 1);
    expect(intervals[1]?.tEnd).toBeCloseTo(0.7, 1);
    expect(findTrimInterval(intervals, 0.5)).toEqual(intervals[1]);
    expect(findTrimInterval(intervals, 0.1)).toEqual(intervals[0]);
  });

  it('removes only the selected middle interval and preserves valid outer topology', () => {
    const source = lineGeometry();
    const result = trimSegmentInterval(source, 'line', 0.3, 0.7);
    expect(source).toEqual(lineGeometry());
    expect(result.segments).toHaveLength(2);
    expect(result.closed).toBe(false);
    expect(validatePathGeometry(result)).toBe(true);
    const xs = result.points.map(point => point.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 30, 70, 100]);
  });

  it('splits the remaining line into independent editable fragments', () => {
    const trimmed = trimSegmentInterval(lineGeometry(), 'line', 0.3, 0.7);
    const fragments = splitGeometryIntoConnectedFragments(trimmed);
    expect(fragments).toHaveLength(2);
    expect(fragments.every(fragment => fragment.segments.length === 1 && fragment.points.length === 2)).toBe(true);
    expect(fragments[0]?.segments[0]?.id).not.toBe(fragments[1]?.segments[0]?.id);
    fragments[0]!.points[0]!.x = 999;
    expect(fragments[1]!.points.some(point => point.x === 999)).toBe(false);
  });

  it('normalizes each fragment without changing its world coordinates', () => {
    const source = lineElement();
    source.rotationDeg = 25;
    const fragments = splitGeometryIntoConnectedFragments(trimSegmentInterval(source.geometry, 'line', 0.3, 0.7));
    for (const fragment of fragments) {
      const before = localToWorld(fragment.points[0]!, source);
      const normalized = normalizePathFragment(fragment, source);
      const after = localToWorld(normalized.geometry.points[0]!, { ...source, position: normalized.position, size: normalized.size });
      expect(after.x).toBeCloseTo(before.x, 8);
      expect(after.y).toBeCloseTo(before.y, 8);
      expect(validatePathGeometry(normalized.geometry)).toBe(true);
    }
  });

  it('handles multiple deterministic intervals and the no-intersection manual fallback', () => {
    const target = lineElement();
    const cutter = circleElement();
    const cutterSnapshot = structuredClone(cutter);
    const second = { ...cutter, id: 'circle-2', position: { xMm: 5, yMm: 0 }, size: { widthMm: 20, heightMm: 40 } };
    const intervals = getSmartTrimIntervals(target, 'line', [target, cutter, second]);
    expect(intervals.map(interval => interval.tStart)).toEqual([...intervals.map(interval => interval.tStart)].sort((a, b) => a - b));
    expect(intervals.length).toBe(5);
    expect(cutter).toEqual(cutterSnapshot);
    const fallback = getSmartTrimIntervals(lineElement(), 'line', [lineElement()]);
    expect(fallback).toEqual([{ segmentId: 'line', tStart: 0, tEnd: 1 }]);
  });

  it('trims a cubic immutably using remapped De Casteljau splits', () => {
    const source: PathGeometry = { points: [{ id: 'a', x: 0, y: 0, outHandle: { x: 30, y: -30 } }, { id: 'b', x: 100, y: 0, inHandle: { x: 70, y: 30 } }], segments: [{ id: 'curve', type: 'CUBIC_BEZIER', fromPointId: 'a', toPointId: 'b' }], closed: false };
    const snapshot = structuredClone(source);
    const result = trimSegmentInterval(source, 'curve', 0.25, 0.75);
    expect(source).toEqual(snapshot);
    expect(result.segments).toHaveLength(2);
    expect(result.segments.every(segment => segment.type === 'CUBIC_BEZIER')).toBe(true);
    expect(validatePathGeometry(result)).toBe(true);
  });

  it('resolves the exact segment chain between existing nodes on an open path', () => {
    const geometry: PathGeometry = {
      points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }, { id: 'c', x: 20, y: 0 }, { id: 'd', x: 30, y: 0 }],
      segments: [
        { id: 'ab', type: 'LINE', fromPointId: 'a', toPointId: 'b' },
        { id: 'bc', type: 'CUBIC_BEZIER', fromPointId: 'b', toPointId: 'c' },
        { id: 'cd', type: 'LINE', fromPointId: 'c', toPointId: 'd' }
      ], closed: false
    };
    expect(getPathRangeBetweenNodes(geometry, 'b', 'c')).toEqual([['bc']]);
    expect(getPathRangeBetweenNodes(geometry, 'a', 'c')).toEqual([['ab', 'bc']]);
    expect(geometry.points).toHaveLength(4);
  });

  it('uses a canonical split node for a segment endpoint without mutating or duplicating source nodes', () => {
    const source = lineGeometry();
    const split = splitPathSegment(source, 'line', 0.4);
    const splitNode = split.points.find(point => !source.points.some(original => original.id === point.id));
    expect(source.points).toHaveLength(2);
    expect(split.points).toHaveLength(3);
    expect(splitNode).toBeDefined();
    expect(new Set(split.points.map(point => point.id)).size).toBe(3);
    expect(getPathRangeBetweenNodes(split, 'a', splitNode!.id)).toHaveLength(1);
  });

  it('returns both closed-path sides deterministically', () => {
    const closed: PathGeometry = {
      points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }, { id: 'c', x: 10, y: 10 }, { id: 'd', x: 0, y: 10 }],
      segments: [
        { id: 'ab', type: 'LINE', fromPointId: 'a', toPointId: 'b' }, { id: 'bc', type: 'LINE', fromPointId: 'b', toPointId: 'c' },
        { id: 'cd', type: 'LINE', fromPointId: 'c', toPointId: 'd' }, { id: 'da', type: 'LINE', fromPointId: 'd', toPointId: 'a' }
      ], closed: true
    };
    const routes = getPathRangeBetweenNodes(closed, 'a', 'c');
    expect(routes).toEqual([['ab', 'bc'], ['da', 'cd']]);
    expect(routes[0]).not.toEqual(routes[1]);
  });

  it('deletes only the selected chain and leaves disconnected remainder fragments', () => {
    const source: PathGeometry = {
      points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }, { id: 'c', x: 20, y: 0 }, { id: 'd', x: 30, y: 0 }],
      segments: [
        { id: 'ab', type: 'LINE', fromPointId: 'a', toPointId: 'b' }, { id: 'bc', type: 'LINE', fromPointId: 'b', toPointId: 'c' },
        { id: 'cd', type: 'LINE', fromPointId: 'c', toPointId: 'd' }
      ], closed: false
    };
    const snapshot = structuredClone(source);
    const result = deletePathSegmentRange(source, ['bc']);
    expect(source).toEqual(snapshot);
    expect(result.segments.map(segment => segment.id)).toEqual(['ab', 'cd']);
    expect(splitGeometryIntoConnectedFragments(result)).toHaveLength(2);
    expect(result.segments.length).toBeGreaterThan(0);
  });
});
