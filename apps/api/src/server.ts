import { createServer } from 'node:http';
import { HeadlessDocumentGenerationService } from '@document-tool/generation-core';
import { createApiHandler } from './app.js';
import { resolveApiRepositoryConfig, resolveApiServerConfig } from './config.js';
import { resolveBundledTemplateDirectory, resolveSharedTemplateDirectory } from './local-template-directory.js';
import { createTemplateRepositoryComposition } from './repository-composition.js';

const { host, port, cloudRuntime } = resolveApiServerConfig();
const repositoryConfig = resolveApiRepositoryConfig();
const composition = createTemplateRepositoryComposition({
  mode: repositoryConfig.mode,
  sharedTemplateDirectory: resolveSharedTemplateDirectory(),
  bundledTemplateDirectory: resolveBundledTemplateDirectory(),
});

const generationService = new HeadlessDocumentGenerationService(composition.repository);
const handler = createApiHandler({ generationService, templateStore: composition.templateStore });

createServer((req,res)=>{ void handler(req,res); }).listen(port,host,()=>{
  console.log(`Document Builder API listening on http://${host}:${port}`);
  console.log(`Runtime: ${cloudRuntime ? 'cloud' : 'local'}`);
  console.log(`Template repository mode: ${composition.mode}`);
  if (composition.diagnostics.sharedTemplateDirectory) {
    console.log(`Shared template directory: ${composition.diagnostics.sharedTemplateDirectory}`);
  }
  if (composition.diagnostics.bundledTemplateDirectory) {
    console.log(`Fallback template directory: ${composition.diagnostics.bundledTemplateDirectory}`);
  }
});
