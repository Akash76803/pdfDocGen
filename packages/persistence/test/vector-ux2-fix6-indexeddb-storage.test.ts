import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('VECTOR-UX2 Fix6 IndexedDB storage migration',()=>{
  it('uses IndexedDB repositories for card templates and user assets',()=>{
    const source=readFileSync(join(process.cwd(),'apps/desktop/src/pages/CardDesigner.tsx'),'utf8');
    expect(source).toContain('new IndexedDbDesignTemplateRepository(window.localStorage)');
    expect(source).toContain('new IndexedDbUserAssetLibraryRepository(window.localStorage)');
  });
  it('does not let a stale Pan-tool toggle steal pointer down from drawing tools',()=>{
    const source=readFileSync(join(process.cwd(),'apps/desktop/src/pages/CardDesigner.tsx'),'utf8');
    expect(source).toContain("panMode&&interactionMode==='SELECT'");
  });
});
