import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 8.4 group UI contract',()=>{
  const designer=readFileSync(resolve(process.cwd(),'apps/desktop/src/pages/CardDesigner.tsx'),'utf8');
  const toolbar=readFileSync(resolve(process.cwd(),'apps/desktop/src/components/designer/DesignerContextToolbar.tsx'),'utf8');
  it('exposes Regroup, group naming and atomic group flip actions',()=>{
    expect(designer).toContain('Regroup');
    expect(designer).toContain('Group name');
    expect(designer).toContain('Flip Group H');
    expect(designer).toContain('restoreGroups');
  });
  it('uses group-aware size matching and toolbar flipping',()=>{
    expect(designer).toContain('matchAlignmentUnitsSize');
    expect(toolbar).toContain('matchAlignmentUnitsSize');
    expect(toolbar).toContain('flipElementsAsGroup');
  });
});
