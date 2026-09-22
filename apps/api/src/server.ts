import { createServer } from 'node:http';
import { HeadlessDocumentGenerationService } from '@document-tool/generation-core';
import { createApiHandler } from './app.js';
import { createStaticBearerAuthenticator } from './auth.js';
import { assertSecureCloudAuthConfig, resolveApiAuthConfig, resolveApiBodyLimitConfig, resolveApiGenerationLimitConfig, resolveApiRateLimitConfig, resolveApiRepositoryConfig, resolveApiServerConfig } from './config.js';
import { resolveBundledTemplateDirectory, resolveSharedTemplateDirectory } from './local-template-directory.js';
import { createTemplateRepositoryComposition } from './repository-composition.js';
import { buildApiStartupDiagnostics, formatApiStartupDiagnostics } from './startup-diagnostics.js';
import { resolveGcpStorageConfig } from './cloud-storage-config.js';
import { createGcpCloudTemplateRepository } from './gcp-cloud-storage.js';
import { createMonitoringLogger } from './observability.js';
import { createInMemoryApiRateLimiter } from './rate-limit.js';
import { createGcpApiIdempotencyStore } from './gcp-idempotency-store.js';

const serverConfig = resolveApiServerConfig();
const repositoryConfig = resolveApiRepositoryConfig();
const bodyLimitConfig = resolveApiBodyLimitConfig();
const generationLimitConfig = resolveApiGenerationLimitConfig();
const rateLimitConfig = resolveApiRateLimitConfig();
const authConfig = resolveApiAuthConfig();
assertSecureCloudAuthConfig(serverConfig, authConfig);
const authenticator = authConfig.mode === 'static-bearer'
  ? createStaticBearerAuthenticator({ token: authConfig.staticBearerToken! })
  : undefined;
const { host, port } = serverConfig;
const gcpStorageConfig = repositoryConfig.mode === 'cloud' ? resolveGcpStorageConfig() : undefined;

const composition = createTemplateRepositoryComposition({
  mode: repositoryConfig.mode,
  sharedTemplateDirectory: resolveSharedTemplateDirectory(),
  bundledTemplateDirectory: resolveBundledTemplateDirectory(),
  ...(gcpStorageConfig ? { cloudDriver:createGcpCloudTemplateRepository(gcpStorageConfig) } : {}),
});

const generationService = new HeadlessDocumentGenerationService(composition.repository);
const rateLimiter = createInMemoryApiRateLimiter(rateLimitConfig);
const idempotencyStore = gcpStorageConfig ? createGcpApiIdempotencyStore(gcpStorageConfig) : undefined;
const handler = createApiHandler({
  generationService,
  templateStore: composition.templateStore,
  bodyLimitConfig,
  generationLimitConfig,
  authenticator,
  rateLimiter,
  idempotencyStore,
  logger:createMonitoringLogger(),
});

createServer((req,res)=>{ void handler(req,res); }).listen(port,host,()=>{
  const startup = buildApiStartupDiagnostics(serverConfig, repositoryConfig, bodyLimitConfig, generationLimitConfig, authConfig);
  console.log(formatApiStartupDiagnostics(startup));
  if (composition.diagnostics.sharedTemplateDirectory) {
    console.log(`Shared template directory: ${composition.diagnostics.sharedTemplateDirectory}`);
  }
  if (composition.diagnostics.bundledTemplateDirectory) {
    console.log(`Fallback template directory: ${composition.diagnostics.bundledTemplateDirectory}`);
  }
});
