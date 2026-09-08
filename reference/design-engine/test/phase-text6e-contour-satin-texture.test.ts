import { describe,expect,it } from 'vitest';
import { defaultTextLayerEffect, duplicateTextLayerEffect, normalizeTextLayerEffects } from '../src/textLayerEffects';

describe('TEXT6E contour satin texture',()=>{
  it('creates editable satin defaults',()=>{const e=defaultTextLayerEffect('SATIN','s1');expect(e.type).toBe('SATIN');expect(e.settings.satinInvert).toBe(false);expect(e.settings.glossContour).toBe('GAUSSIAN');});
  it('preserves bevel contour and texture metadata',()=>{const e=defaultTextLayerEffect('BEVEL_EMBOSS','b1');e.settings.glossContour='DOUBLE_RING';e.settings.contourStrength=1.4;e.settings.textureDepth=.35;e.settings.texturePattern={kind:'DOT',foreground:'#fff',background:'#111827',scale:10,rotationDeg:0,opacity:1};const copy=duplicateTextLayerEffect([e],'b1','b2')[1]!;expect(copy.settings.glossContour).toBe('DOUBLE_RING');expect(copy.settings.textureDepth).toBe(.35);expect(copy.settings.texturePattern?.kind).toBe('DOT');});
  it('round trips new settings',()=>{const e=defaultTextLayerEffect('SATIN','s1');e.settings.satinInvert=true;const r=normalizeTextLayerEffects(JSON.parse(JSON.stringify([e])))[0]!;expect(r.settings.satinInvert).toBe(true);});
});
