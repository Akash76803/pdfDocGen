import { describe, expect, it } from 'vitest';
import { fitImageToShapePatch } from './shapeImageFit.ts';

describe('UX-9.1 one-click shape image fitting', () => {
  it('converts a default text shape into a centered clipped cover image', () => {
    expect(fitImageToShapePatch({ shapeContentMode: 'text', shapeMediaPosition: 'left', imageFit: 'contain' })).toEqual({
      shapeContentMode: 'media',
      shapeMediaPosition: 'background',
      shapeClipMedia: true,
      shapePadding: 0,
      imageFit: 'cover',
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
    expect(result.imageFit).toBe('cover');
    expect(result.imageZoomPercent).toBe(100);
    expect(result.imageObjectPosition).toBe('center');
    expect(fitImageToShapePatch({ ...previous, ...result })).toEqual(result);
  });
});
