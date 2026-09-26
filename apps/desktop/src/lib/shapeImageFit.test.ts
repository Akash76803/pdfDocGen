import { describe, expect, it } from 'vitest';
import { fitImageToShapePatch, isPointInsideShapeClip, shapeSafeMediaBounds } from './shapeImageFit.ts';

describe('UX-9.1 one-click shape image fitting', () => {
  it('converts a default text shape into a centered clipped no-crop image', () => {
    expect(fitImageToShapePatch({ shapeContentMode: 'text', shapeMediaPosition: 'left', imageFit: 'contain' })).toEqual({
      shapeContentMode: 'media',
      shapeMediaPosition: 'background',
      shapeClipMedia: true,
      shapePadding: 0,
      imageFit: 'contain',
      imageObjectPosition: 'center',
      imageZoomPercent: 100,
      shapeMediaOverlayOpacity: 100,
    });
  });
  it('retains explicitly combined text+media and its text padding', () => {
    const actual = fitImageToShapePatch({ shapeContentMode: 'text-media', shapePadding: 20 });
    expect(actual.shapeContentMode).toBe('text-media');
    expect(actual.shapePadding).toBe(20);
  });
  it('resets existing image offset/fit so the action is repeatable', () => {
    const previous = { shapeContentMode: 'media' as const, imageFit: 'fill' as const, imageZoomPercent: 320, imageObjectPosition: 'left' as const };
    const result = fitImageToShapePatch(previous);
    expect(result.imageFit).toBe('contain');
    expect(result.imageZoomPercent).toBe(100);
    expect(result.imageObjectPosition).toBe('center');
    expect(fitImageToShapePatch({ ...previous, ...result })).toEqual(result);
  });
});

describe('UX-9.2 no-crop shape-safe bounds', () => {
  it('keeps entire image available in a regular rectangle', () => {
    expect(shapeSafeMediaBounds('none', 300, 100)).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });
  it('inscribes the whole image in a circle instead of clipping its corners', () => {
    const clip = 'ellipse(50% 50% at 50% 50%)';
    const bounds = shapeSafeMediaBounds(clip, 200, 200);
    expect(bounds.width).toBeGreaterThan(69);
    expect(bounds.width).toBeLessThan(71);
    expect(bounds.left).toBeCloseTo(bounds.top);
    const corners = [
      { x: bounds.left / 100, y: bounds.top / 100 },
      { x: (bounds.left + bounds.width) / 100, y: bounds.top / 100 },
      { x: bounds.left / 100, y: (bounds.top + bounds.height) / 100 },
      { x: (bounds.left + bounds.width) / 100, y: (bounds.top + bounds.height) / 100 },
    ];
    for (const corner of corners) expect(isPointInsideShapeClip(clip, corner, 200, 200)).toBe(true);
  });
  it.each([
    'polygon(50% 0%, 100% 100%, 0% 100%)',
    'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
    'inset(0 round 24px)',
  ])('stays wholly inside the preset: %s', (clip) => {
    const bounds = shapeSafeMediaBounds(clip, 220, 110);
    expect(bounds.width).toBeGreaterThan(0);
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const low = bounds.left / 100, high = (bounds.left + bounds.width) / 100;
      const v = low + (high - low) * t;
      expect(isPointInsideShapeClip(clip, { x: v, y: low }, 220, 110)).toBe(true);
      expect(isPointInsideShapeClip(clip, { x: v, y: high }, 220, 110)).toBe(true);
      expect(isPointInsideShapeClip(clip, { x: low, y: v }, 220, 110)).toBe(true);
      expect(isPointInsideShapeClip(clip, { x: high, y: v }, 220, 110)).toBe(true);
    }
  });
});
