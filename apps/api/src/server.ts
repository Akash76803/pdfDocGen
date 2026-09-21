import { createServer } from 'node:http';
import { HeadlessDocumentGenerationService } from '@document-tool/generation-core';
import { createApiHandler } from './app.js';
import { createStaticBearerAuthenticator } from './auth.js';
import { resolveApiAuthConfig, resolveApiBodyLimitConfig, resolveApiGenerationLimitConfig, resolveApiRepositoryConfig, resolveApiServerConfig } from './config.js';
import { resolveBundledTemplateDirectory, resolveSharedTemplateDirectory } from './local-template-directory.js';
import { createTemplateRepositoryComposition } from './repository-composition.js';
import { buildApiStartupDiagnostics, formatApiStartupDiagnostics } from './startup-diagnostics.js';
import { resolveGcpStorageConfig } from './cloud-storage-config.js';
import { createGcpCloudTemplateRepository } from './gcp-cloud-storage.js';

const serverConfig = resolveApiServerConfig();
const repositoryConfig = resolveApiRepositoryConfig();
const bodyLimitConfig = resolveApiBodyLimitConfig();
const generationLimitConfig = resolveApiGenerationLimitConfig();
const authConfig = resolveApiAuthConfig();
const authenticator = authConfig.mode === 'static-bearer'
  ? createStaticBearerAuthenticator({ token: authConfig.staticBearerToken! })
  : undefined;
const { host, port } = serverConfig;

const composition = createTemplateRepositoryComposition({
  mode: repositoryConfig.mode,
  sharedTemplateDirectory: resolveSharedTemplateDirectory(),
  bundledTemplateDirectory: resolveBundledTemplateDirectory(),
  ...(repositoryConfig.mode === 'cloud' ? { cloudDriver:createGcpCloudTemplateRepository(resolveGcpStorageConfig()) } : {}),
});

const generationService = new HeadlessDocumentGenerationService(composition.repository);
const handler = createApiHandler({
  generationService,
  templateStore: composition.templateStore,
  bodyLimitConfig,
  generationLimitConfig,
  authenticator,
});

createServer((req,res)=>{ void handler(req,res); }).listen(port,host,()=>{
  const startup = buildApiStartupDiagnostics(serverConfig, repositoryConfig, bodyLimitConfig, generationLimitConfig);
  console.log(formatApiStartupDiagnostics(startup));
  if (composition.diagnostics.sharedTemplateDirectory) {
    console.log(`Shared template directory: ${composition.diagnostics.sharedTemplateDirectory}`);
  }
  if (composition.diagnostics.bundledTemplateDirectory) {
    console.log(`Fallback template directory: ${composition.diagnostics.bundledTemplateDirectory}`);
  }
});
