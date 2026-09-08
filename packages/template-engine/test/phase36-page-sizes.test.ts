import { describe, expect, it } from 'vitest';
import type { TemplateDefinition } from '@document-tool/contracts';
import { PAGE_SIZE_DIMENSIONS, getPageDimensions } from '@document-tool/contracts';
import { TemplateValidator } from '../src/template-validator.js';

const tpl=(size:TemplateDefinition['page']['size'], extra:Partial<TemplateDefinition['page']>={}):TemplateDefinition=>({id:'p',name:'Page',version:1,page:{size,orientation:'PORTRAIT',margins:{top:5,right:5,bottom:5,left:5},...extra},header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]}});

describe('expanded page sizes',()=>{
 it('supports ISO A/B and office sizes',()=>{ for(const size of ['A0','A1','A3','A10','B0','B5','LETTER','LEGAL','TABLOID','LEDGER','EXECUTIVE'] as const) expect(new TemplateValidator().validate(tpl(size)).valid).toBe(true); });
 it('resolves A1 dimensions and landscape orientation',()=>{ expect(PAGE_SIZE_DIMENSIONS.A1).toEqual({widthMm:594,heightMm:841}); expect(getPageDimensions({...tpl('A1').page,orientation:'LANDSCAPE'})).toEqual({widthMm:841,heightMm:594}); });
 it('accepts valid custom size',()=>expect(new TemplateValidator().validate(tpl('CUSTOM',{customWidthMm:300,customHeightMm:600})).valid).toBe(true));
 it('rejects missing/invalid custom dimensions',()=>expect(new TemplateValidator().validate(tpl('CUSTOM',{customWidthMm:0,customHeightMm:600})).valid).toBe(false));
});
