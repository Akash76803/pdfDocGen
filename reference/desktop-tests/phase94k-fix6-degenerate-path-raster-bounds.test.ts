import { describe, expect, it } from 'vitest';
import { DEFAULT_CARTON_DIELINE_INPUT, generateCartonDieline } from '@document-tool/design-engine';
import type { PathDesignElement } from '@document-tool/contracts';
import { resolvePathRasterBounds } from '../src/pages/cardExportPathBounds';

const MM_TO_CSS_PX = 96 / 25.4;

describe('Phase 9.4K Fix6 - degenerate PATH raster bounds', () => {
  it('gives generated vertical and horizontal carton creases a non-degenerate raster paint box', () => {
    const generated = generateCartonDieline(DEFAULT_CARTON_DIELINE_INPUT);
    const artboard = generated.template.artboards[0];
    const creases = artboard.elements.filter(
      (element): element is PathDesignElement => element.type === 'PATH' && element.metadata?.technicalLayer === 'CREASE',
    );

    expect(creases.length).toBeGreaterThan(0);

    for (const crease of creases) {
      const bounds = resolvePathRasterBounds(crease);
      const sourceIsDegenerate = crease.size.widthMm <= 0.0011 || crease.size.heightMm <= 0.0011;
      expect(sourceIsDegenerate).toBe(true);
      expect(Math.min(bounds.widthMm, bounds.heightMm) * MM_TO_CSS_PX).toBeGreaterThanOrEqual(0.9);

      const sourceCenterX = crease.position.xMm + crease.size.widthMm / 2;
      const sourceCenterY = crease.position.yMm + crease.size.heightMm / 2;
      const exportCenterX = bounds.xMm + bounds.widthMm / 2;
      const exportCenterY = bounds.yMm + bounds.heightMm / 2;
      expect(exportCenterX).toBeCloseTo(sourceCenterX, 9);
      expect(exportCenterY).toBeCloseTo(sourceCenterY, 9);
    }
  });

  it('does not mutate the stored PATH geometry or size', () => {
    const generated = generateCartonDieline(DEFAULT_CARTON_DIELINE_INPUT);
    const crease = generated.template.artboards[0].elements.find(
      (element): element is PathDesignElement => element.type === 'PATH' && element.metadata?.technicalLayer === 'CREASE',
    );
    expect(crease).toBeDefined();
    if (!crease) return;

    const before = JSON.stringify(crease);
    resolvePathRasterBounds(crease);
    expect(JSON.stringify(crease)).toBe(before);
  });
});
