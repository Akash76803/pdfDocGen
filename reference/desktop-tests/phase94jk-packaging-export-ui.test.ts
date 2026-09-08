import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source=fs.readFileSync(path.resolve(process.cwd(),'apps/desktop/src/pages/CardDesigner.tsx'),'utf8');

describe('Phase 9.4J-K packaging export UI wiring',()=>{
  it('exposes the three packaging proof modes',()=>{
    expect(source).toContain('Packaging Output');
    expect(source).toContain('Artwork Only · Client Proof');
    expect(source).toContain('Artwork + CUT/CREASE · Dieline Proof');
    expect(source).toContain('CUT/CREASE + Labels · Technical View');
  });
  it('filters both normal and bulk raster targets through the export policy',()=>{
    expect(source).toContain('prepareArtboardForCardExport(resolveArtboardBindings');
    expect(source).toContain('const resolvedForExport=prepareArtboardForCardExport(resolved,cardRequest)');
  });
});
