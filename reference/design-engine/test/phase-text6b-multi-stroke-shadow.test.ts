import { describe,it,expect } from 'vitest';
import { addTextLayerEffect, duplicateTextLayerEffect, moveTextLayerEffect, normalizeTextLayerEffects, toggleTextLayerEffect } from '../src/textLayerEffects.js';

describe('TEXT6B multi-stroke and multi-shadow stack',()=>{
  it('keeps multiple strokes and drop shadows as independent ordered entries',()=>{
    let effects=addTextLayerEffect([], 'STROKE', 'stroke-a');
    effects=duplicateTextLayerEffect(effects,'stroke-a','stroke-b');
    effects=addTextLayerEffect(effects,'DROP_SHADOW','shadow-a');
    effects=duplicateTextLayerEffect(effects,'shadow-a','shadow-b');
    expect(effects.map(effect=>effect.type)).toEqual(['STROKE','STROKE','DROP_SHADOW','DROP_SHADOW']);
    expect(new Set(effects.map(effect=>effect.id)).size).toBe(4);
    effects=toggleTextLayerEffect(effects,'stroke-b',false);
    expect(effects.find(effect=>effect.id==='stroke-a')?.enabled).toBe(true);
    expect(effects.find(effect=>effect.id==='stroke-b')?.enabled).toBe(false);
  });

  it('reorders one effect without mutating other effect settings',()=>{
    let effects=addTextLayerEffect([], 'STROKE', 'stroke-a');
    effects=addTextLayerEffect(effects,'DROP_SHADOW','shadow-a');
    effects[0]!.settings={...effects[0]!.settings,color:'#ff0000',widthMm:.6};
    effects[1]!.settings={...effects[1]!.settings,color:'#0000ff',distanceMm:2,angleDeg:30};
    const moved=moveTextLayerEffect(effects,'shadow-a','UP');
    expect(moved.map(effect=>effect.id)).toEqual(['shadow-a','stroke-a']);
    expect(moved[1]!.settings.color).toBe('#ff0000');
    expect(moved[0]!.settings.distanceMm).toBe(2);
  });

  it('round-trips multiple effects through JSON persistence',()=>{
    let effects=addTextLayerEffect([], 'STROKE', 'stroke-a');
    effects=addTextLayerEffect(effects,'STROKE','stroke-b');
    effects=addTextLayerEffect(effects,'DROP_SHADOW','shadow-a');
    effects=addTextLayerEffect(effects,'DROP_SHADOW','shadow-b');
    const restored=normalizeTextLayerEffects(JSON.parse(JSON.stringify(effects)));
    expect(restored).toHaveLength(4);
    expect(restored.filter(effect=>effect.type==='STROKE')).toHaveLength(2);
    expect(restored.filter(effect=>effect.type==='DROP_SHADOW')).toHaveLength(2);
  });
});
