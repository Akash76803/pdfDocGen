import { createServer } from 'node:http';
import { HeadlessDocumentGenerationService } from '@document-tool/generation-core';
import { createApiHandler } from './app.js';
import { resolveApiServerConfig } from './config.js';
import { resolveBundledTemplateDirectory, resolveSharedTemplateDirectory } from './local-template-directory.js';
import { CompositeTemplateRepository, FileSystemTemplateRepository } from './template-repository.js';

const { host, port, cloudRuntime } = resolveApiServerConfig();
const sharedTemplateDirectory = resolveSharedTemplateDirectory();
const bundledTemplateDirectory = resolveBundledTemplateDirectory();
const sharedRepository = new FileSystemTemplateRepository(sharedTemplateDirectory);
const bundledRepository = new FileSystemTemplateRepository(bundledTemplateDirectory);
const repository = new CompositeTemplateRepository([sharedRepository, bundledRepository]);
const generationService = new HeadlessDocumentGenerationService(repository);
const handler = createApiHandler({ generationService, templateStore: sharedRepository });

createServer((req,res)=>{ void handler(req,res); }).listen(port,host,()=>{
  console.log(`Document Builder API listening on http://${host}:${port}`);
  console.log(`Runtime: ${cloudRuntime ? 'cloud' : 'local'}`);
  console.log(`Shared template directory: ${sharedRepository.rootDirectory}`);
  console.log(`Fallback template directory: ${bundledRepository.rootDirectory}`);
});
