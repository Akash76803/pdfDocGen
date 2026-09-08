import { describe,expect,it } from 'vitest';
import type { TemplateDefinition } from '@document-tool/contracts';
import { TemplateValidator } from '../src/template-validator.js';
const base=():TemplateDefinition=>({id:'t',name:'Valid',version:1,page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}},header:{blocks:[]},body:{blocks:[{id:'f',type:'FIELD',path:'customer.name'}]},footer:{blocks:[]}});
describe('TemplateValidator',()=>{
 it('accepts a valid template',()=>expect(new TemplateValidator().validate(base()).valid).toBe(true));
 it('rejects missing name and invalid margins',()=>{const t=base();t.name='';t.page.margins.left=-1;const c=new TemplateValidator().validate(t).errors.map(e=>e.code);expect(c).toContain('TEMPLATE_NAME_REQUIRED');expect(c).toContain('PAGE_MARGIN_INVALID');});
 it('detects duplicate block IDs',()=>{const t=base();t.body.blocks.push({id:'f',type:'TEXT',text:'x'});expect(new TemplateValidator().validate(t).errors.some(e=>e.code==='BLOCK_ID_DUPLICATE')).toBe(true);});
 it('validates field and table requirements',()=>{const t=base();t.body.blocks=[{id:'f',type:'FIELD',path:''},{id:'tb',type:'TABLE',sourcePath:'',columns:[]}];const codes=new TemplateValidator().validate(t).errors.map(e=>e.code);expect(codes).toContain('FIELD_PATH_REQUIRED');expect(codes).toContain('TABLE_SOURCE_REQUIRED');expect(codes).toContain('TABLE_COLUMN_REQUIRED');});
 it('validates table column paths',()=>{const t=base();t.body.blocks=[{id:'tb',type:'TABLE',sourcePath:'items',columns:[{id:'c',label:'Bad',path:''}]}];expect(new TemplateValidator().validate(t).errors.some(e=>e.code==='TABLE_COLUMN_PATH_REQUIRED')).toBe(true);});
});
