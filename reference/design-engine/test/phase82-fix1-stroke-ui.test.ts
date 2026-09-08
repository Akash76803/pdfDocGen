import {describe,expect,it} from 'vitest';
import {parseStrokeDashPatternText} from '../src/index.js';

describe('Phase 8.2 Fix1 custom dash input',()=>{
  it('accepts comma-separated dash patterns',()=>{
    expect(parseStrokeDashPatternText('12, 3, 2, 3')).toEqual({dashArray:[12,3,2,3]});
  });

  it('accepts whitespace-separated dash patterns',()=>{
    expect(parseStrokeDashPatternText('12 3 2 3')).toEqual({dashArray:[12,3,2,3]});
  });

  it('rejects invalid and incomplete dash patterns without corrupting stroke state',()=>{
    expect(parseStrokeDashPatternText('12')).toHaveProperty('error');
    expect(parseStrokeDashPatternText('12, nope, 3')).toHaveProperty('error');
    expect(parseStrokeDashPatternText('12, -3')).toHaveProperty('error');
  });
});
