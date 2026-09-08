import { describe,expect,it } from 'vitest';
import { resolvePath } from '../src/path-resolver.js';
describe('safe path resolver',()=>{
 it('resolves nested, numeric and boolean values',()=>{const x={a:{b:2,c:false}};expect(resolvePath(x,'a.b')).toEqual({found:true,value:2});expect(resolvePath(x,'a.c')).toEqual({found:true,value:false});});
 it('returns controlled missing and null values',()=>{expect(resolvePath({a:null},'a')).toEqual({found:true,value:null});expect(resolvePath({},'a.b').found).toBe(false);});
 it.each(['__proto__','constructor.prototype','prototype.x'])('blocks unsafe path %s',(p)=>expect(resolvePath({},p).found).toBe(false));
 it('respects maximum depth',()=>expect(resolvePath({a:{b:{c:1}}},'a.b.c',2).found).toBe(false));
});
