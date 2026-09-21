import type { ApiBodyLimitConfig, ApiGenerationLimitConfig, ApiRepositoryConfig, ApiServerConfig } from './config.js';

export type ApiStartupDiagnostics = {
  runtime: 'local' | 'cloud';
  host: string;
  port: number;
  repositoryMode: ApiRepositoryConfig['mode'];
  requestBodyMb: number;
  absoluteMaxBodyMb: number;
  generationTimeoutMs: number;
  maxBatchDocuments: number;
};

export function buildApiStartupDiagnostics(
  server: ApiServerConfig,
  repository: ApiRepositoryConfig,
  body: ApiBodyLimitConfig,
  generation: ApiGenerationLimitConfig,
): ApiStartupDiagnostics {
  return {
    runtime: server.cloudRuntime ? 'cloud' : 'local',
    host: server.host,
    port: server.port,
    repositoryMode: repository.mode,
    requestBodyMb: body.effectiveLimitMb,
    absoluteMaxBodyMb: body.absoluteMaxMb,
    generationTimeoutMs: generation.effectiveTimeoutMs,
    maxBatchDocuments: generation.effectiveMaxBatchDocuments,
  };
}

export function formatApiStartupDiagnostics(diagnostics: ApiStartupDiagnostics): string {
  return JSON.stringify({
    event: 'api_startup',
    service: 'document-builder-api',
    ...diagnostics,
  });
}
