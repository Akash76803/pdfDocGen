import { describe,it,expect } from 'vitest';
import { createTextElement } from '../src/elements.js';

describe('TEXT3 advanced text defaults',()=>{
  it('creates backward-safe BOX text with auto fit disabled',()=>{
    const text=createTextElement({id:'text-1'});
    expect(text.style.textPath?.mode).toBe('BOX');
    expect(text.style.textPath?.startOffsetPct).toBe(50);
    expect(text.style.autoFit).toEqual({enabled:false,minFontSizePt:6});
  });

  it('keeps advanced text options serializable',()=>{
    const text=createTextElement({id:'text-2'});
    text.style.textPath={mode:'CIRCLE',startOffsetPct:25,reverse:true,side:'INSIDE'};
    text.style.autoFit={enabled:true,minFontSizePt:8};
    const roundTrip=JSON.parse(JSON.stringify(text));
    expect(roundTrip.style.textPath).toEqual(text.style.textPath);
    expect(roundTrip.style.autoFit).toEqual(text.style.autoFit);
  });
});
