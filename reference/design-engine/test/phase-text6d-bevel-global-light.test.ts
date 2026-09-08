import { describe, expect, it } from 'vitest';
import { defaultTextLayerEffect, duplicateTextLayerEffect, normalizeTextLayerEffects } from '../src/textLayerEffects.js';

describe('TEXT6D bevel emboss + global light contract',()=>{
  it('creates a Photoshop-like bevel effect with editable lighting controls',()=>{
    const effect=defaultTextLayerEffect('BEVEL_EMBOSS','bevel-1');
    expect(effect.settings).toMatchObject({
      bevelStyle:'INNER_BEVEL',
      bevelTechnique:'SMOOTH',
      depthPct:100,
      sizeMm:.35,
      softenMm:.1,
      direction:'UP',
      useGlobalLight:true,
      angleDeg:120,
      altitudeDeg:30,
      highlightBlendMode:'SCREEN',
      shadowBlendMode:'MULTIPLY',
      glossContour:'LINEAR'
    });
  });

  it('preserves bevel settings through normalize and duplicate',()=>{
    const effect=defaultTextLayerEffect('BEVEL_EMBOSS','bevel-1');
    effect.settings={...effect.settings,bevelStyle:'EMBOSS',bevelTechnique:'CHISEL_HARD',depthPct:240,angleDeg:35,altitudeDeg:55,glossContour:'RING'};
    const duplicated=duplicateTextLayerEffect([effect],'bevel-1','bevel-2');
    expect(duplicated).toHaveLength(2);
    expect(duplicated[1]?.settings).toMatchObject({bevelStyle:'EMBOSS',bevelTechnique:'CHISEL_HARD',depthPct:240,angleDeg:35,altitudeDeg:55,glossContour:'RING'});
    expect(normalizeTextLayerEffects(duplicated)).toEqual(duplicated);
  });
});
