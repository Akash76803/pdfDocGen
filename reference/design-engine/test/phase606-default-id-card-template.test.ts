import {describe,expect,it} from 'vitest';
import {createCorporateEmployeeIdTemplate,validateDesignTemplate} from '../src/index.js';

describe('default Corporate Employee ID Card starter template',()=>{
 it('creates a valid editable CR80 Front + Back template',()=>{
  let n=0;const t=createCorporateEmployeeIdTemplate(p=>`${p}-${++n}`);
  expect(t.name).toBe('Corporate Employee ID Card');
  expect(t.artboards).toHaveLength(2);
  expect(t.artboards.map(a=>a.name)).toEqual(['Front','Back']);
  for(const a of t.artboards){expect(a.widthMm).toBe(85.6);expect(a.heightMm).toBe(53.98);expect(a.print.bleed.topMm).toBe(3);}
  const front=t.artboards[0]!,back=t.artboards[1]!;
  expect(front.elements.some(e=>e.type==='SHAPE'&&e.name==='Header')).toBe(true);
  expect(front.elements.some(e=>e.type==='SHAPE'&&e.name==='Photo')).toBe(true);
  expect(front.elements.some(e=>e.type==='TEXT'&&e.name==='Company')).toBe(true);
  const hasBinding = (e: any, path: string) => Array.isArray(e.bindings) && e.bindings.length > 0 && e.bindings[0].targetProperty === 'text' && e.bindings[0].sourceType === 'FIELD' && e.bindings[0].fieldPath === path;
  expect(front.elements.some(e=>e.type==='TEXT'&&hasBinding(e, 'Employee.Name'))).toBe(true);
  expect(front.elements.some(e=>e.type==='TEXT'&&hasBinding(e, 'Employee.Designation'))).toBe(true);
  expect(front.elements.some(e=>e.type==='TEXT'&&hasBinding(e, 'Employee.EmployeeId'))).toBe(true);
  expect(front.elements.some(e=>e.type==='TEXT'&&hasBinding(e, 'Employee.Department'))).toBe(true);
  expect(front.elements.some(e=>e.name==='QR')).toBe(true);
  expect(back.elements.some(e=>e.type==='TEXT'&&e.name==='Address')).toBe(true);
  expect(back.elements.some(e=>e.type==='TEXT'&&hasBinding(e, 'Employee.EmergencyContact'))).toBe(true);
  expect(back.elements.some(e=>e.type==='TEXT'&&hasBinding(e, 'Employee.ValidUntil'))).toBe(true);
  expect(back.elements.some(e=>e.type==='TEXT'&&hasBinding(e, 'Employee.BloodGroup'))).toBe(true);
  expect(back.elements.some(e=>e.type==='SHAPE'&&e.name==='Signature')).toBe(true);
  expect(back.elements.some(e=>e.type==='TEXT'&&e.name==='Terms'&&e.text.includes('return this card'))).toBe(true);
  expect(validateDesignTemplate(t).valid).toBe(true);
 });
 it('ensures no elements expose the legacy binding property', () => {
  const t = createCorporateEmployeeIdTemplate();
  for (const artboard of t.artboards) {
    for (const element of artboard.elements) {
      expect((element as any).binding).toBeUndefined();
    }
  }
 });
 it('uses independent ids across repeated template creation',()=>{
  let n=0;const f=(p:string)=>`${p}-${++n}`;const a=createCorporateEmployeeIdTemplate(f),b=createCorporateEmployeeIdTemplate(f);expect(a.id).not.toBe(b.id);expect(a.artboards[0]!.id).not.toBe(b.artboards[0]!.id);
 });
});
