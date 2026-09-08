import { describe, expect, it } from 'vitest';
import {
  assignImportedDielineLayer,
  createSvgDielineArtboard,
  importSvgDieline,
  lockImportedDielineTechnicalGeometry,
  mapSelectionToPackagingPanel,
  packagingPanelsFromArtboard,
} from '../src/index.js';
import { createBlankArtboard } from '../src/artboards.js';
import type { DesignTemplate } from '@document-tool/contracts';

const ids=()=>{let n=0;return(prefix:string)=>`${prefix}-${++n}`;};
const base=():DesignTemplate=>({kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'T',version:1,status:'DRAFT',artboards:[createBlankArtboard({id:'a',name:'A',order:0,widthMm:10,heightMm:10})],sharedAssets:[]});
const SVG=`<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="100mm" viewBox="0 0 400 200">
  <path id="cut-outline" d="M 20 20 L 380 20 L 380 180 L 20 180 Z" />
  <line id="crease-main" x1="200" y1="20" x2="200" y2="180" />
  <rect id="panel-region" x="20" y="20" width="180" height="160" />
</svg>`;

describe('Phase 9.4L-M SVG dieline import and manual mapping',()=>{
 it('splits multi-subpath SVG paths into independent editable vectors',()=>{
  const result=importSvgDieline('<svg width="100mm" height="50mm" viewBox="0 0 100 50"><path id="crease" d="M10 0 V50 M20 0 V50 M30 0 V50"/></svg>',ids());
  expect(result.elements).toHaveLength(3);expect(result.elements.every(e=>e.metadata?.technicalLayer==='CREASE')).toBe(true);expect(result.elements.every(e=>e.geometry.closed===false)).toBe(true);
 });
 it('preserves physical SVG dimensions and converts viewBox coordinates to mm',()=>{
  const result=importSvgDieline(SVG,ids());
  expect(result.widthMm).toBeCloseTo(200,6);expect(result.heightMm).toBeCloseTo(100,6);expect(result.elements).toHaveLength(3);
  const cut=result.elements.find(e=>e.name==='cut-outline')!;expect(cut.position.xMm).toBeCloseTo(10);expect(cut.position.yMm).toBeCloseTo(10);expect(cut.size.widthMm).toBeCloseTo(180);expect(cut.size.heightMm).toBeCloseTo(80);expect(cut.geometry.closed).toBe(true);
 });
 it('infers CUT/CREASE semantics from common SVG ids and creates technical groups',()=>{
  const result=importSvgDieline(SVG,ids());const template=createSvgDielineArtboard(base(),result,'a','Imported');const art=template.artboards[0]!;
  expect(art.groups.find(g=>g.name==='CUT')?.elementIds).toHaveLength(1);expect(art.groups.find(g=>g.name==='CREASE')?.elementIds).toHaveLength(1);
  expect(art.elements.find(e=>e.name==='crease-main')?.metadata?.technicalLayer).toBe('CREASE');
 });
 it('supports manual technical assignment and technical lock/unlock',()=>{
  const result=importSvgDieline(SVG,ids());let template=createSvgDielineArtboard(base(),result,'a','Imported');const other=template.artboards[0]!.elements.find(e=>e.name==='panel-region')!;
  template=assignImportedDielineLayer(template,'a',[other.id],'CREASE');expect(template.artboards[0]!.elements.find(e=>e.id===other.id)?.metadata?.technicalLayer).toBe('CREASE');
  template=lockImportedDielineTechnicalGeometry(template,'a',true);expect(template.artboards[0]!.elements.find(e=>e.id===other.id)?.locked).toBe(true);
  template=lockImportedDielineTechnicalGeometry(template,'a',false);expect(template.artboards[0]!.elements.find(e=>e.id===other.id)?.locked).toBe(false);
 });
 it('maps selected geometry bounds to canonical packaging panels',()=>{
  const result=importSvgDieline(SVG,ids());let template=createSvgDielineArtboard(base(),result,'a','Imported');const region=template.artboards[0]!.elements.find(e=>e.name==='panel-region')!;
  template=mapSelectionToPackagingPanel(template,'a',[region.id],'FRONT',{safeMarginMm:5,bleedMm:3});const panel=packagingPanelsFromArtboard(template.artboards[0]!).find(p=>p.id==='manual-front')!;
  expect(panel.name).toBe('FRONT');expect(panel.widthMm).toBeCloseTo(90);expect(panel.heightMm).toBeCloseTo(80);expect(panel.safeMarginMm).toBe(5);expect(panel.bleedMm).toBe(3);expect(panel.editable).toBe(true);
 });
});
