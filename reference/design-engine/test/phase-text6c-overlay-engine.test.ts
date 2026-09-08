import { describe, expect, it } from 'vitest';
import { addTextLayerEffect, duplicateTextLayerEffect, normalizeTextLayerEffects } from '../src/textLayerEffects.js';

describe('TEXT6C overlay engine',()=>{
  it('creates color, gradient and pattern overlays with independent settings',()=>{
    let effects=addTextLayerEffect([], 'COLOR_OVERLAY', 'color-1');
    effects=addTextLayerEffect(effects, 'GRADIENT_OVERLAY', 'gradient-1');
    effects=addTextLayerEffect(effects, 'PATTERN_OVERLAY', 'pattern-1');
    expect(effects.map(e=>e.type)).toEqual(['COLOR_OVERLAY','GRADIENT_OVERLAY','PATTERN_OVERLAY']);
    expect(effects[1]?.settings.gradient?.stops).toHaveLength(2);
    expect(effects[2]?.settings.pattern?.kind).toBe('HATCH');
  });

  it('deep-copies gradient stops and pattern settings on duplicate',()=>{
    let effects=addTextLayerEffect([], 'GRADIENT_OVERLAY', 'gradient-1');
    effects=addTextLayerEffect(effects, 'PATTERN_OVERLAY', 'pattern-1');
    effects=duplicateTextLayerEffect(effects,'gradient-1','gradient-2');
    effects=duplicateTextLayerEffect(effects,'pattern-1','pattern-2');
    const g1=effects.find(e=>e.id==='gradient-1')!,g2=effects.find(e=>e.id==='gradient-2')!;
    const p1=effects.find(e=>e.id==='pattern-1')!,p2=effects.find(e=>e.id==='pattern-2')!;
    expect(g1.settings.gradient).not.toBe(g2.settings.gradient);
    expect(g1.settings.gradient?.stops).not.toBe(g2.settings.gradient?.stops);
    expect(p1.settings.pattern).not.toBe(p2.settings.pattern);
  });

  it('survives JSON round-trip',()=>{
    let effects=addTextLayerEffect([], 'COLOR_OVERLAY', 'c');
    effects=addTextLayerEffect(effects, 'GRADIENT_OVERLAY', 'g');
    effects=addTextLayerEffect(effects, 'PATTERN_OVERLAY', 'p');
    const restored=normalizeTextLayerEffects(JSON.parse(JSON.stringify(effects)));
    expect(restored.map(e=>e.type)).toEqual(['COLOR_OVERLAY','GRADIENT_OVERLAY','PATTERN_OVERLAY']);
  });
});
