import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const canvasSource=readFileSync(resolve(process.cwd(),'apps/desktop/src/pages/CardExportCanvas.tsx'),'utf8');
const designerSource=readFileSync(resolve(process.cwd(),'apps/desktop/src/pages/CardDesigner.tsx'),'utf8');

describe('Phase 9.4K Fix4 prepared export canvas visibility contract',()=>{
  it('does not re-apply editor element visibility inside the isolated export canvas',()=>{
    expect(canvasSource).not.toContain('e.visible && !e.runtimeHidden');
    expect(canvasSource).toContain("!e.runtimeHidden && e.metadata?.cadExport !== false && e.metadata?.cadConstruction !== true");
  });

  it('describes dieline proof as export-mode controlled rather than editor-visible only',()=>{
    expect(designerSource).toContain('Artwork plus CUT and CREASE lines are exported, regardless of editor layer visibility.');
    expect(designerSource).not.toContain('Artwork plus visible CUT and CREASE lines are exported.');
  });

  it('only feeds prepared artboards into the isolated raster export canvas in production paths',()=>{
    expect(designerSource).toContain('const targets = sourceTargets.map(t => prepareArtboardForCardExport(resolveArtboardBindings(t, dataContext),request));');
    expect(designerSource).toContain('const resolvedForExport=prepareArtboardForCardExport(resolved,cardRequest);');
    expect(designerSource).toContain('setExportRasterTargets([resolvedForExport]);');
  });
});
