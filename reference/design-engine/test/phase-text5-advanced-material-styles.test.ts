import { describe,it,expect } from 'vitest';
import { createTextElement } from '../src/elements.js';

describe('TEXT5 advanced text effects and material styles',()=>{
  it('creates backward-safe TEXT5 defaults',()=>{
    const text=createTextElement('TEXT5',{id:'text5'});
    expect(text.style.materialPreset).toBe('CUSTOM');
    expect(text.style.advancedEffects?.bevel?.enabled).toBe(false);
    expect(text.style.advancedEffects?.highlight?.enabled).toBe(false);
    expect(text.style.advancedEffects?.longShadow?.enabled).toBe(false);
  });

  it('persists material and advanced effect settings through JSON',()=>{
    const text=createTextElement('Chrome',{id:'chrome'});
    text.style.materialPreset='CHROME';
    text.style.advancedEffects={
      bevel:{enabled:true,depthMm:.4,highlightColor:'#ffffff',shadowColor:'#111827',intensity:.8},
      highlight:{enabled:true,color:'#ffffff',offsetYmm:-.2,blurMm:.1,opacity:.75},
      longShadow:{enabled:true,color:'#222222',distanceMm:2,angleDeg:45,opacity:.4},
    };
    const roundTrip=JSON.parse(JSON.stringify(text));
    expect(roundTrip.style.materialPreset).toBe('CHROME');
    expect(roundTrip.style.advancedEffects.bevel.enabled).toBe(true);
    expect(roundTrip.style.advancedEffects.longShadow.distanceMm).toBe(2);
  });
});

describe('TEXT5 expansion layer effects',()=>{
  it('includes new layer-effect defaults without breaking older fields',()=>{
    const text=createTextElement('Expanded',{id:'expanded'});
    expect(text.style.advancedEffects?.innerShadow?.enabled).toBe(false);
    expect(text.style.advancedEffects?.innerGlow?.enabled).toBe(false);
    expect(text.style.advancedEffects?.secondaryStroke?.enabled).toBe(false);
    expect(text.style.advancedEffects?.reflection?.enabled).toBe(false);
    expect(text.style.advancedEffects?.grain?.enabled).toBe(false);
  });

  it('persists expanded material preset and layer effects through JSON',()=>{
    const text=createTextElement('Holographic',{id:'holo'});
    text.style.materialPreset='HOLOGRAPHIC';
    text.style.advancedEffects={
      ...text.style.advancedEffects,
      innerGlow:{enabled:true,color:'#ffffff',blurMm:.8,opacity:.55},
      secondaryStroke:{enabled:true,color:'#67e8f9',widthMm:.3,opacity:.9},
      reflection:{enabled:true,color:'#ffffff',offsetYmm:.3,blurMm:.25,opacity:.4},
      grain:{enabled:true,color:'#ffffff',amount:70,opacity:.25},
    };
    const roundTrip=JSON.parse(JSON.stringify(text));
    expect(roundTrip.style.materialPreset).toBe('HOLOGRAPHIC');
    expect(roundTrip.style.advancedEffects.secondaryStroke.widthMm).toBe(.3);
    expect(roundTrip.style.advancedEffects.grain.amount).toBe(70);
  });
});
