import { describe, expect, it } from 'vitest';
import { layoutFlow } from '../src/flow.js';

describe('runtime block flow',()=>{
  it('positions each block directly after the measured previous block plus spacing',()=>{
    expect(layoutFlow([{id:'words',height:20},{id:'bank',height:30,marginTop:4}],0)).toEqual([
      {id:'words',top:0,bottom:20,height:20},
      {id:'bank',top:24,bottom:54,height:30},
    ]);
  });
  it('reacts to dynamic previous height without stale design-time Y',()=>{
    const short=layoutFlow([{id:'a',height:10},{id:'b',height:5,marginTop:2}]);
    const long=layoutFlow([{id:'a',height:30},{id:'b',height:5,marginTop:2}]);
    expect(short[1]?.top).toBe(12);
    expect(long[1]?.top).toBe(32);
  });
});
