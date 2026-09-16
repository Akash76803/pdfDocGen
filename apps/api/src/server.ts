import { createServer } from 'node:http';
import { HeadlessDocumentGenerationService } from '@document-tool/generation-core';
import { createApiHandler } from './app.js';
import { resolveBundledTemplateDirectory, resolveSharedTemplateDirectory } from './local-template-directory.js';
import { CompositeTemplateRepository, FileSystemTemplateRepository } from './template-repository.js';

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const sharedTemplateDirectory = resolveSharedTemplateDirectory();
const bundledTemplateDirectory = resolveBundledTemplateDirectory();
const sharedRepository = new FileSystemTemplateRepository(sharedTemplateDirectory);
const bundledRepository = new FileSystemTemplateRepository(bundledTemplateDirectory);
const repository = new CompositeTemplateRepository([sharedRepository, bundledRepository]);
const generationService = new HeadlessDocumentGenerationService(repository);
const handler = createApiHandler({ generationService, templateStore: sharedRepository });

createServer((req,res)=>{ void handler(req,res); }).listen(port,host,()=>{
  console.log(`Document Builder API listening on http://${host}:${port}`);
  console.log(`Shared template directory: ${sharedRepository.rootDirectory}`);
  console.log(`Fallback template directory: ${bundledRepository.rootDirectory}`);
});
