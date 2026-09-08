import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 8.4 Fix2 Layers UI contract',()=>{
  const designer=readFileSync(resolve(process.cwd(),'apps/desktop/src/pages/CardDesigner.tsx'),'utf8');
  const styles=readFileSync(resolve(process.cwd(),'apps/desktop/src/styles/designer.css'),'utf8');

  it('renders groups as hierarchical containers with directly editable group names',()=>{
    expect(designer).toContain('card-layer-group-container');
    expect(designer).toContain('card-layer-group-children');
    expect(designer).toContain('Rename group ${group.name}');
    expect(designer).toContain('Collapse group');
    expect(styles).toContain('.card-layer-group-container');
    expect(styles).toContain('.card-layer-group-children::before');
  });

  it('routes group z-order controls through all group member ids',()=>{
    expect(designer).toContain("moveLayers(t,artboard.id,group.elementIds,'FRONT')");
    expect(designer).toContain("moveLayers(t,artboard.id,group.elementIds,'FORWARD')");
    expect(designer).toContain("moveLayers(t,artboard.id,group.elementIds,'BACKWARD')");
    expect(designer).toContain("moveLayers(t,artboard.id,group.elementIds,'BACK')");
  });
});
