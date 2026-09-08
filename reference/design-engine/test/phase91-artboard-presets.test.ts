import { describe,expect,it } from 'vitest';
import { ARTBOARD_PRESETS,applyArtboardPreset,createBlankArtboard,findArtboardPresetBySize,orientedPresetDimensions,searchArtboardPresets } from '../src/index.js';
import type { DesignTemplate } from '@document-tool/contracts';

function template():DesignTemplate{return{kind:'CARD_DESIGN',schemaVersion:1,id:'t',name:'Test',version:1,status:'DRAFT',sharedAssets:[],artboards:[createBlankArtboard({id:'a',name:'Front',order:0,widthMm:90,heightMm:50})]};}

describe('Phase 9.1 professional page formats',()=>{
 it('covers cards, folded work, labels, tags, stickers and international paper',()=>{expect(ARTBOARD_PRESETS.length).toBeGreaterThanOrEqual(35);for(const category of ['CARD','FOLDED','LABEL','TAG','STICKER','PAPER'])expect(ARTBOARD_PRESETS.some(p=>p.category===category)).toBe(true);expect(ARTBOARD_PRESETS.some(p=>p.id==='a0')).toBe(true);expect(ARTBOARD_PRESETS.some(p=>p.id==='a10')).toBe(true);expect(ARTBOARD_PRESETS.some(p=>p.id==='b6')).toBe(true);});
 it('searches labels and tags and respects categories',()=>{expect(searchArtboardPresets(ARTBOARD_PRESETS,'wedding').some(p=>p.id==='invitation-5x7')).toBe(true);expect(searchArtboardPresets(ARTBOARD_PRESETS,'shipping','LABEL').map(p=>p.id)).toEqual(['label-shipping-100x150']);expect(searchArtboardPresets(ARTBOARD_PRESETS,'shipping','CARD')).toEqual([]);});
 it('orients without changing the physical format',()=>{const a4=ARTBOARD_PRESETS.find(p=>p.id==='a4')!;expect(orientedPresetDimensions(a4,'LANDSCAPE')).toEqual({widthMm:297,heightMm:210});expect(orientedPresetDimensions(a4,'PORTRAIT')).toEqual({widthMm:210,heightMm:297});});
 it('applies format dimensions, print defaults and metadata',()=>{const preset=ARTBOARD_PRESETS.find(p=>p.id==='business-card-90x50')!;const result=applyArtboardPreset(template(),'a',preset,'LANDSCAPE').artboards[0]!;expect([result.widthMm,result.heightMm]).toEqual([90,50]);expect(result.print.bleed).toEqual({topMm:3,rightMm:3,bottomMm:3,leftMm:3});expect(result.print.safeArea).toEqual({topMm:3,rightMm:3,bottomMm:3,leftMm:3});expect(result.metadata?.presetId).toBe(preset.id);});
 it('matches rotated sizes',()=>{const match=findArtboardPresetBySize(297,210);expect(match).toBeDefined();expect([match!.widthMm,match!.heightMm].sort((a,b)=>a-b)).toEqual([210,297]);});
});
