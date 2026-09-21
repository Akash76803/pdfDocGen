import { describe, expect, it } from 'vitest';
import type { TemplateRepository } from '@document-tool/generation-core';
import type { LocalTemplateFileStore } from './app.js';
import { CompositeTemplateRepository, FileSystemTemplateRepository } from './template-repository.js';
import { createTemplateRepositoryComposition, type CloudTemplateDriver } from './repository-composition.js';

describe('CLOUD-1 repository composition', () => {
  it('keeps filesystem mode as the local/offline default implementation', () => {
    const result = createTemplateRepositoryComposition({
      mode: 'filesystem',
      sharedTemplateDirectory: './tmp/shared',
      bundledTemplateDirectory: './tmp/bundled',
    });

    expect(result.mode).toBe('filesystem');
    expect(result.repository).toBeInstanceOf(CompositeTemplateRepository);
    expect(result.templateStore).toBeInstanceOf(FileSystemTemplateRepository);
    expect(result.diagnostics.sharedTemplateDirectory).toContain('tmp');
    expect(result.diagnostics.bundledTemplateDirectory).toContain('tmp');
  });

  it('fails fast instead of silently using ephemeral filesystem storage in cloud mode', () => {
    expect(() => createTemplateRepositoryComposition({
      mode: 'cloud',
      sharedTemplateDirectory: './tmp/shared',
      bundledTemplateDirectory: './tmp/bundled',
    })).toThrow('no persistent cloud template driver is available');
  });

  it('uses an injected persistent cloud driver without changing the generation contract', async () => {
    const saved:string[] = [];
    const cloudDriver: CloudTemplateDriver = {
      async getTemplate(templateId:string) {
        return templateId === 'invoice'
          ? {
              id:'invoice',name:'Invoice',version:1,
              page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}},
              header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]},
            }
          : null;
      },
      async saveDesktopTemplateEntry(value:unknown) {
        saved.push((value as {id:string}).id);
        return 'cloud://invoice';
      },
      async deleteTemplateFile(templateId:string) {
        saved.push(`deleted:${templateId}`);
      },
    };

    const result = createTemplateRepositoryComposition({
      mode: 'cloud',
      sharedTemplateDirectory: './unused/shared',
      bundledTemplateDirectory: './unused/bundled',
      cloudDriver,
    });

    expect(result.mode).toBe('cloud');
    expect(result.repository).toBe(cloudDriver as TemplateRepository);
    expect(result.templateStore).toBe(cloudDriver as LocalTemplateFileStore);
    expect(await result.repository.getTemplate('invoice')).toMatchObject({ id:'invoice', version:1 });
    await result.templateStore.saveDesktopTemplateEntry({ id:'invoice', payload:{} });
    expect(saved).toEqual(['invoice']);
  });
});
