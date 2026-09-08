import { describe,expect,it } from 'vitest';
import { DEFAULT_CARTON_DIELINE_INPUT,generateCartonDieline,prepareElementForPackagingPanel,setPackagingPanelArtworkOrientation,packagingPanelsFromArtboard,runPackagingPreflight,selectPackagingPanelArtworkIds } from '../src/index.js';
import { createTextElement } from '../src/elements.js';

const ids=()=>{let n=0;return(prefix:string)=>`${prefix}-${++n}`;};

describe('Phase 9.4G-I packaging orientation, inspector helpers and preflight',()=>{
 it('rotates assigned panel artwork and persists quarter-turn orientation metadata',()=>{
  const generated=generateCartonDieline(DEFAULT_CARTON_DIELINE_INPUT,ids());
  const artboard=generated.template.artboards[0]!,panel=generated.measurements.packagingPanels.find(item=>item.id==='body-front')!;
  const text=prepareElementForPackagingPanel(createTextElement({id:'headline',name:'Headline',xMm:panel.xMm+10,yMm:panel.yMm+20,zIndex:500}),panel);
  const template={...generated.template,artboards:[{...artboard,elements:[...artboard.elements,text]}]};
  const next=setPackagingPanelArtworkOrientation(template,artboard.id,panel.id,90,generated.measurements.packagingPanels);
  const nextPanel=packagingPanelsFromArtboard(next.artboards[0]!).find(item=>item.id===panel.id)!;
  const nextText=next.artboards[0]!.elements.find(item=>item.id===text.id)!;
  expect(nextPanel.artworkRotationDeg).toBe(90);
  expect(nextText.rotationDeg).toBe(90);
  expect(selectPackagingPanelArtworkIds(next.artboards[0]!,panel.id)).toContain(text.id);
 });

 it('reports structural and artwork preflight issues without treating infos as failure',()=>{
  const generated=generateCartonDieline(DEFAULT_CARTON_DIELINE_INPUT,ids());
  const artboard=generated.template.artboards[0]!,panel=generated.measurements.packagingPanels.find(item=>item.id==='body-front')!;
  const text=prepareElementForPackagingPanel(createTextElement({id:'unsafe',name:'Unsafe',xMm:panel.xMm,yMm:panel.yMm,zIndex:500}),panel);
  const result=runPackagingPreflight({...artboard,elements:[...artboard.elements,text]},generated.measurements.packagingPanels);
  expect(result.errors).toBe(0);
  expect(result.warnings).toBeGreaterThan(0);
  expect(result.issues.some(issue=>issue.code==='SAFE_AREA')).toBe(true);
  expect(result.passed).toBe(true);
 });

 it('fails preflight when CUT geometry is missing',()=>{
  const generated=generateCartonDieline(DEFAULT_CARTON_DIELINE_INPUT,ids());
  const artboard=generated.template.artboards[0]!;
  const stripped={...artboard,elements:artboard.elements.filter(element=>element.metadata?.technicalLayer!=='CUT')};
  const result=runPackagingPreflight(stripped,generated.measurements.packagingPanels);
  expect(result.errors).toBeGreaterThan(0);
  expect(result.issues.some(issue=>issue.code==='CUT_MISSING')).toBe(true);
  expect(result.passed).toBe(false);
 });
});
