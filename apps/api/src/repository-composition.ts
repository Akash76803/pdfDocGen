import type { TemplateRepository } from '@document-tool/generation-core';
import type { LocalTemplateFileStore } from './app.js';
import type { ApiTemplateRepositoryMode } from './config.js';
import { CompositeTemplateRepository, FileSystemTemplateRepository } from './template-repository.js';

export type CloudTemplateDriver = TemplateRepository & LocalTemplateFileStore;

export type TemplateRepositoryComposition = {
  mode: ApiTemplateRepositoryMode;
  repository: TemplateRepository;
  templateStore: LocalTemplateFileStore;
  diagnostics: {
    mode: ApiTemplateRepositoryMode;
    sharedTemplateDirectory?: string;
    bundledTemplateDirectory?: string;
  };
};

export type TemplateRepositoryCompositionOptions = {
  mode: ApiTemplateRepositoryMode;
  sharedTemplateDirectory: string;
  bundledTemplateDirectory: string;
  cloudDriver?: CloudTemplateDriver;
};

export function createTemplateRepositoryComposition(
  options: TemplateRepositoryCompositionOptions,
): TemplateRepositoryComposition {
  if (options.mode === 'cloud') {
    if (!options.cloudDriver) {
      throw Object.assign(
        new Error('Cloud template repository mode is configured, but no persistent cloud template driver is available.'),
        { code: 'CLOUD_TEMPLATE_REPOSITORY_UNAVAILABLE' },
      );
    }
    return {
      mode: 'cloud',
      repository: options.cloudDriver,
      templateStore: options.cloudDriver,
      diagnostics: { mode: 'cloud' },
    };
  }

  const sharedRepository = new FileSystemTemplateRepository(options.sharedTemplateDirectory);
  const bundledRepository = new FileSystemTemplateRepository(options.bundledTemplateDirectory);
  return {
    mode: 'filesystem',
    repository: new CompositeTemplateRepository([sharedRepository, bundledRepository]),
    templateStore: sharedRepository,
    diagnostics: {
      mode: 'filesystem',
      sharedTemplateDirectory: sharedRepository.rootDirectory,
      bundledTemplateDirectory: bundledRepository.rootDirectory,
    },
  };
}
