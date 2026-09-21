import { createServer } from 'node:http';
import { HeadlessDocumentGenerationService } from '@document-tool/generation-core';
import { createApiHandler } from './app.js';
import { resolveApiBodyLimitConfig, resolveApiRepositoryConfig, resolveApiServerConfig } from './config.js';
import { resolveBundledTemplateDirectory, resolveSharedTemplateDirectory } from './local-template-directory.js';
import { createTemplateRepositoryComposition } from './repository-composition.js';
import { buildApiStartupDiagnostics, formatApiStartupDiagnostics } from './startup-diagnostics.js';

const serverConfig = resolveApiServerConfig();
const repositoryConfig = resolveApiRepositoryConfig();
const bodyLimitConfig = resolveApiBodyLimitConfig();
const { host, port } = serverConfig;

const composition = createTemplateRepositoryComposition({
  mode: repositoryConfig.mode,
  sharedTemplateDirectory: resolveSharedTemplateDirectory(),
  bundledTemplateDirectory: resolveBundledTemplateDirectory(),
});

const generationService = new HeadlessDocumentGenerationService(composition.repository);
const handler = createApiHandler({
  generationService,
  templateStore: composition.templateStore,
  bodyLimitConfig,
});

createServer((req,res)=>{ void handler(req,res); }).listen(port,host,()=>{
  const startup = buildApiStartupDiagnostics(serverConfig, repositoryConfig, bodyLimitConfig);
  console.log(formatApiStartupDiagnostics(startup));
  if (composition.diagnostics.sharedTemplateDirectory) {
    console.log(`Shared template directory: ${composition.diagnostics.sharedTemplateDirectory}`);
  }
  if (composition.diagnostics.bundledTemplateDirectory) {
    console.log(`Fallback template directory: ${composition.diagnostics.bundledTemplateDirectory}`);
  }
});
