import { describe,it,expect } from 'vitest';
import { addTextLayerEffect, duplicateTextLayerEffect, migrateLegacyTextEffects, normalizeTextLayerEffects, removeTextLayerEffect, resetTextLayerEffect, toggleTextLayerEffect } from '../src/textLayerEffects.js';
import { createTextElement } from '../src/elements.js';

describe('TEXT6A Layer Effects foundation',()=>{
  it('adds, toggles, duplicates, resets and removes independent stack effects',()=>{
    let effects=addTextLayerEffect([], 'STROKE', 'stroke-1');
    effects=addTextLayerEffect(effects,'DROP_SHADOW','shadow-1');
    expect(effects.map(e=>e.type)).toEqual(['STROKE','DROP_SHADOW']);
    effects=toggleTextLayerEffect(effects,'stroke-1',false);
    expect(effects[0]?.enabled).toBe(false);
    effects=duplicateTextLayerEffect(effects,'shadow-1','shadow-2');
    expect(effects).toHaveLength(3);
    expect(new Set(effects.map(e=>e.id)).size).toBe(3);
    effects=resetTextLayerEffect(effects,'shadow-2');
    expect(effects.find(e=>e.id==='shadow-2')?.type).toBe('DROP_SHADOW');
    effects=removeTextLayerEffect(effects,'stroke-1');
    expect(effects.map(e=>e.id)).toEqual(['shadow-1','shadow-2']);
  });

  it('migrates legacy stroke/glow/inner effects without losing the old style object',()=>{
    const element=createTextElement('Layer FX');
    element.style.stroke={color:'#ff0000',widthMm:.4,opacity:.8};
    element.style.glow={enabled:true,color:'#00ffff',blurMm:2,opacity:.6};
    element.style.advancedEffects={innerShadow:{enabled:true,color:'#222222',offsetXmm:.2,offsetYmm:.3,blurMm:.5,opacity:.4},innerGlow:{enabled:true,color:'#ffffff',blurMm:.7,opacity:.5},bevel:{enabled:true,depthMm:.3,highlightColor:'#ffffff',shadowColor:'#111111',intensity:.7}};
    const migrated=migrateLegacyTextEffects(element.style,prefix=>`m-${prefix}`);
    expect(migrated.map(e=>e.type)).toEqual(['STROKE','OUTER_GLOW','INNER_SHADOW','INNER_GLOW','BEVEL_EMBOSS']);
    expect(element.style.stroke.color).toBe('#ff0000');
    expect(element.style.glow.enabled).toBe(true);
  });

  it('normalizes duplicate IDs for safe JSON persistence',()=>{
    const effect=addTextLayerEffect([], 'INNER_GLOW', 'same')[0]!;
    const normalized=normalizeTextLayerEffects([effect,{...effect,settings:{...effect.settings}}]);
    expect(new Set(normalized.map(e=>e.id)).size).toBe(2);
    const persisted=JSON.parse(JSON.stringify(normalized));
    expect(persisted).toHaveLength(2);
  });
});
