import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Phase 9.2 professional template gallery',()=>{const source=readFileSync(new URL('../src/pages/CardDesigner.tsx',import.meta.url),'utf8');it('supports search, categories and production metadata',()=>{for(const marker of ['Professional Templates','Search professional templates','Template category','formatLabel','previewColor','Editable · Print ready'])expect(source).toContain(marker);});it('loads selected templates through the existing protected workflow',()=>{expect(source).toContain('onClick={()=>onLoad(starter.id)}');expect(source).toContain('Replace current unsaved design');});});
