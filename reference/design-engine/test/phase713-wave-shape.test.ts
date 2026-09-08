import {describe,expect,it} from 'vitest';
import {shapeToPathGeometry} from '../src/index.js';

describe('Wave shape',()=>{
  it('creates a closed editable curved geometry',()=>{
    const geometry=shapeToPathGeometry('WAVE',{widthMm:40,heightMm:20});
    expect(geometry.closed).toBe(true);
    expect(geometry.points).toHaveLength(6);
    expect(geometry.segments).toHaveLength(6);
    expect(geometry.segments.filter(segment=>segment.type==='CUBIC_BEZIER')).toHaveLength(4);
    expect(geometry.points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y))).toBe(true);
    expect(Math.min(...geometry.points.map(point=>point.x))).toBe(0);
    expect(Math.max(...geometry.points.map(point=>point.x))).toBe(40);
    expect(new Set(geometry.segments.flatMap(segment=>[segment.fromPointId,segment.toPointId]))).toEqual(new Set(geometry.points.map(point=>point.id)));
  });
});
