import { describe, it, expect } from 'vitest';
import { 
  createBlankArtboard, addArtboard, duplicateArtboard, deleteArtboard, moveArtboard, 
  setArtboardRole, pairArtboards, unpairArtboard, createBackSide, resolveTargetArtboards, applyPrintSettingsToTargets
} from '../src/artboards.js';
import { validateDesignTemplate } from '../src/validation.js';
import { createDefaultDesignElementRegistry } from '../src/element-registry.js';
import type { DesignTemplate, Artboard } from '@document-tool/contracts';

function fresh(): DesignTemplate {
  const artboard = createBlankArtboard({ id: 'a1', name: 'Front', order: 0, widthMm: 90, heightMm: 50 });
  return {
    kind: 'CARD_DESIGN',
    schemaVersion: 1,
    id: 'tpl1',
    name: 'Tpl',
    version: 1,
    status: 'DRAFT',
    artboards: [artboard],
    sharedAssets: []
  };
}

describe('Phase 6.4 Multi-Artboard', () => {
  it('deterministic artboard order & reorder operations', () => {
    let t = fresh();
    t = addArtboard(t, createBlankArtboard({ id: 'a2', name: 'Back', order: 1, widthMm: 90, heightMm: 50 }));
    expect(t.artboards.map(a => a.id)).toEqual(['a1', 'a2']);
    
    t = moveArtboard(t, 'a1', 1);
    expect(t.artboards.map(a => a.id)).toEqual(['a2', 'a1']);
    expect(t.artboards[0]!.order).toBe(0);
    expect(t.artboards[1]!.order).toBe(1);
  });

  it('role assignment & pair Front/Back', () => {
    let t = fresh();
    t = addArtboard(t, createBlankArtboard({ id: 'a2', name: 'Back', order: 1, widthMm: 90, heightMm: 50 }));
    t = setArtboardRole(t, 'a1', 'FRONT');
    t = setArtboardRole(t, 'a2', 'BACK');
    t = pairArtboards(t, 'a1', 'a2', 'pair-1');
    
    expect(t.artboards[0]!.role).toBe('FRONT');
    expect(t.artboards[0]!.pairId).toBe('pair-1');
    expect(t.artboards[1]!.role).toBe('BACK');
    expect(t.artboards[1]!.pairId).toBe('pair-1');
  });

  it('cannot self-pair', () => {
    const t = fresh();
    expect(() => pairArtboards(t, 'a1', 'a1', 'pair-1')).toThrow();
  });

  it('unpair', () => {
    let t = fresh();
    t = addArtboard(t, createBlankArtboard({ id: 'a2', name: 'Back', order: 1, widthMm: 90, heightMm: 50 }));
    t = pairArtboards(t, 'a1', 'a2', 'pair-1');
    t = unpairArtboard(t, 'a1');
    
    expect(t.artboards[0]!.pairId).toBeUndefined();
    expect(t.artboards[1]!.pairId).toBeUndefined();
  });

  it('create Back Side', () => {
    let t = fresh();
    t = createBackSide(t, 'a1', 'a2', 'pair-1');
    
    expect(t.artboards.length).toBe(2);
    expect(t.artboards[0]!.role).toBe('FRONT');
    expect(t.artboards[1]!.role).toBe('BACK');
    expect(t.artboards[0]!.pairId).toBe('pair-1');
    expect(t.artboards[1]!.pairId).toBe('pair-1');
    expect(t.artboards[1]!.widthMm).toBe(90);
  });

  it('duplicate artboard gets new IDs & drops pair', () => {
    let t = fresh();
    t = addArtboard(t, createBlankArtboard({ id: 'a2', name: 'Back', order: 1, widthMm: 90, heightMm: 50 }));
    t = pairArtboards(t, 'a1', 'a2', 'pair-1');
    
    t = duplicateArtboard(t, 'a2', 'a3');
    expect(t.artboards.length).toBe(3);
    const a3 = t.artboards.find(a => a.id === 'a3')!;
    expect(a3.pairId).toBeUndefined();
    expect(t.artboards.find(a => a.id === 'a2')!.pairId).toBe('pair-1');
  });

  it('delete paired artboard cleans relationship', () => {
    let t = fresh();
    t = createBackSide(t, 'a1', 'a2', 'pair-1');
    t = deleteArtboard(t, 'a2');
    
    expect(t.artboards.length).toBe(1);
    expect(t.artboards[0]!.pairId).toBeUndefined();
  });

  it('mixed-size artboards supported', () => {
    let t = fresh();
    t = addArtboard(t, createBlankArtboard({ id: 'a2', name: 'Insert', order: 1, widthMm: 80, heightMm: 40 }));
    expect(t.artboards[0]!.widthMm).toBe(90);
    expect(t.artboards[1]!.widthMm).toBe(80);
  });

  it('CURRENT target resolution', () => {
    let t = fresh();
    t = addArtboard(t, createBlankArtboard({ id: 'a2', name: 'Insert', order: 1, widthMm: 80, heightMm: 40 }));
    const target = resolveTargetArtboards(t, 'CURRENT', 'a2', []);
    expect(target.artboardIds).toEqual(['a2']);
  });

  it('SELECTED target resolution', () => {
    let t = fresh();
    t = addArtboard(t, createBlankArtboard({ id: 'a2', name: 'Insert', order: 1, widthMm: 80, heightMm: 40 }));
    const target = resolveTargetArtboards(t, 'SELECTED', 'a1', ['a1', 'a2']);
    expect(target.artboardIds).toEqual(['a1', 'a2']);
  });

  it('ALL target resolution', () => {
    let t = fresh();
    t = addArtboard(t, createBlankArtboard({ id: 'a2', name: 'Insert', order: 1, widthMm: 80, heightMm: 40 }));
    const target = resolveTargetArtboards(t, 'ALL', 'a1', []);
    expect(target.artboardIds).toEqual(['a1', 'a2']);
  });

  it('structure validation catches invalid pairs', () => {
    let t = fresh();
    t = addArtboard(t, createBlankArtboard({ id: 'a2', name: 'Back', order: 1, widthMm: 90, heightMm: 50 }));
    t.artboards[0]!.pairId = 'bad-pair';
    
    const registry = createDefaultDesignElementRegistry();
    const result = validateDesignTemplate(t, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'ARTBOARD_PAIR_INVALID')).toBe(true);
  });
});
