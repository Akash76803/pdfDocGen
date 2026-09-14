import { describe, expect, it } from 'vitest';
import { getPdfRenderProfile, normalizePdfRenderProfile, PDF_RENDER_PROFILES } from './pdfRenderProfile.ts';

describe('DB-5E PDF render profiles', () => {
  it('defaults legacy/unknown requests to the fast standard profile', () => {
    expect(normalizePdfRenderProfile(undefined)).toBe('standard');
    expect(normalizePdfRenderProfile('legacy')).toBe('standard');
    expect(getPdfRenderProfile(undefined).dpi).toBe(144);
  });

  it('keeps explicit balanced and print profiles deterministic', () => {
    expect(PDF_RENDER_PROFILES.balanced.dpi).toBe(192);
    expect(PDF_RENDER_PROFILES.print.dpi).toBe(300);
    expect(PDF_RENDER_PROFILES.standard.jpegQuality).toBeLessThan(PDF_RENDER_PROFILES.print.jpegQuality);
  });
});
