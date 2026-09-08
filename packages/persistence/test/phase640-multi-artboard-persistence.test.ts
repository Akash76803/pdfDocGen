import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalStorageDesignTemplateRepository } from '../src/design-template-repository.js';
import type { StringStorage } from '../src/workspace-persistence.js';
import type { DesignTemplate, Artboard } from '@document-tool/contracts';
import { resolvePrintSettings } from '@document-tool/design-engine';

class MemoryStorage implements StringStorage {
  private data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe('Phase 6.4 Multi-Artboard Persistence', () => {
  let repo: LocalStorageDesignTemplateRepository;
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    repo = new LocalStorageDesignTemplateRepository(storage);
  });

  afterEach(() => {
  });

  it('persists order, role, pair metadata, mixed sizes', async () => {
    const artboard1: Artboard = {
      id: 'a1',
      name: 'Front',
      order: 0,
      widthMm: 90,
      heightMm: 50,
      displayUnit: 'MM',
      background: { type: 'SOLID', color: '#ffffff', opacity: 1 },
      print: resolvePrintSettings(),
      guides: [],
      groups: [],
      elements: [],
      role: 'FRONT',
      pairId: 'pair-1'
    };

    const artboard2: Artboard = {
      id: 'a2',
      name: 'Back',
      order: 1,
      widthMm: 90,
      heightMm: 50,
      displayUnit: 'MM',
      background: { type: 'SOLID', color: '#ffffff', opacity: 1 },
      print: resolvePrintSettings(),
      guides: [],
      groups: [],
      elements: [],
      role: 'BACK',
      pairId: 'pair-1'
    };

    const artboard3: Artboard = {
      id: 'a3',
      name: 'Insert',
      order: 2,
      widthMm: 85,
      heightMm: 55,
      displayUnit: 'MM',
      background: { type: 'SOLID', color: '#ffffff', opacity: 1 },
      print: resolvePrintSettings(),
      guides: [],
      groups: [],
      elements: [],
      role: 'GENERIC'
    };

    const template: DesignTemplate = {
      kind: 'CARD_DESIGN',
      schemaVersion: 1,
      id: 'tpl1',
      name: 'Test Template',
      version: 1,
      status: 'DRAFT',
      artboards: [artboard1, artboard2, artboard3],
      sharedAssets: []
    };

    await repo.save(template);
    const loaded = await repo.getById('tpl1');

    expect(loaded).toBeDefined();
    expect(loaded!.artboards.length).toBe(3);
    expect(loaded!.artboards[0]!.role).toBe('FRONT');
    expect(loaded!.artboards[0]!.pairId).toBe('pair-1');
    expect(loaded!.artboards[1]!.role).toBe('BACK');
    expect(loaded!.artboards[1]!.pairId).toBe('pair-1');
    expect(loaded!.artboards[2]!.role).toBe('GENERIC');
    expect(loaded!.artboards[2]!.widthMm).toBe(85);
  });
});
