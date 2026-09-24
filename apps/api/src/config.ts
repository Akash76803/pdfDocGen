export const DEFAULT_API_MAX_BODY_MB = 20;
export const DEFAULT_API_ABSOLUTE_MAX_BODY_MB = 50;
export const DEFAULT_API_GENERATION_TIMEOUT_MS = 240_000;
export const DEFAULT_API_ABSOLUTE_GENERATION_TIMEOUT_MS = 295_000;
export const DEFAULT_API_MAX_BATCH_DOCUMENTS = 100;
export const DEFAULT_API_ABSOLUTE_MAX_BATCH_DOCUMENTS = 500;
export const DEFAULT_API_PORT = 8787;
export const DEFAULT_LOCAL_API_HOST = '127.0.0.1';
export const DEFAULT_CLOUD_API_HOST = '0.0.0.0';
export const DEFAULT_TEMPLATE_REPOSITORY_MODE = 'filesystem' as const;
export const DEFAULT_API_AUTH_MODE = 'disabled' as const;
export const DEFAULT_API_RATE_LIMIT_PER_MINUTE = 120;
export const DEFAULT_API_ABSOLUTE_RATE_LIMIT_PER_MINUTE = 1000;

export type ApiBodyLimitConfig = {
  requestedLimitMb: number;
  absoluteMaxMb: number;
  effectiveLimitMb: number;
  effectiveLimitBytes: number;
};

export type ApiServerConfig = {
  host: string;
  port: number;
  cloudRuntime: boolean;
};

export type ApiGenerationLimitConfig = {
  requestedTimeoutMs: number;
  absoluteTimeoutMs: number;
  effectiveTimeoutMs: number;
  requestedMaxBatchDocuments: number;
  absoluteMaxBatchDocuments: number;
  effectiveMaxBatchDocuments: number;
};

export type ApiRateLimitConfig = {
  requestedPerMinute: number;
  absolutePerMinute: number;
  effectivePerMinute: number;
  windowMs: number;
};

export type ApiTemplateRepositoryMode = 'filesystem' | 'cloud';
export type ApiAuthMode = 'disabled' | 'static-bearer' | 'identity-platform' | 'hybrid';

export type ApiAuthConfig = {
  mode: ApiAuthMode;
  staticBearerToken?: string;
  identityProjectId?: string;
  identityAllowedEmails: string[];
  identityRequireEmailVerified: boolean;
};

export type ApiRepositoryConfig = {
  mode: ApiTemplateRepositoryMode;
};

function parsePositiveMb(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveApiBodyLimitConfig(env: NodeJS.ProcessEnv = process.env): ApiBodyLimitConfig {
  const requestedLimitMb = parsePositiveMb(env.API_MAX_BODY_MB, DEFAULT_API_MAX_BODY_MB);
  const absoluteMaxMb = parsePositiveMb(env.API_ABSOLUTE_MAX_BODY_MB, DEFAULT_API_ABSOLUTE_MAX_BODY_MB);
  const effectiveLimitMb = Math.min(requestedLimitMb, absoluteMaxMb);

  return {
    requestedLimitMb,
    absoluteMaxMb,
    effectiveLimitMb,
    effectiveLimitBytes: Math.floor(effectiveLimitMb * 1024 * 1024),
  };
}

export function resolveApiGenerationLimitConfig(env: NodeJS.ProcessEnv = process.env): ApiGenerationLimitConfig {
  const requestedTimeoutMs = parsePositiveInteger(env.API_GENERATION_TIMEOUT_MS, DEFAULT_API_GENERATION_TIMEOUT_MS);
  const absoluteTimeoutMs = parsePositiveInteger(env.API_ABSOLUTE_GENERATION_TIMEOUT_MS, DEFAULT_API_ABSOLUTE_GENERATION_TIMEOUT_MS);
  const requestedMaxBatchDocuments = parsePositiveInteger(env.API_MAX_BATCH_DOCUMENTS, DEFAULT_API_MAX_BATCH_DOCUMENTS);
  const absoluteMaxBatchDocuments = parsePositiveInteger(env.API_ABSOLUTE_MAX_BATCH_DOCUMENTS, DEFAULT_API_ABSOLUTE_MAX_BATCH_DOCUMENTS);
  return {
    requestedTimeoutMs,
    absoluteTimeoutMs,
    effectiveTimeoutMs: Math.min(requestedTimeoutMs, absoluteTimeoutMs),
    requestedMaxBatchDocuments,
    absoluteMaxBatchDocuments,
    effectiveMaxBatchDocuments: Math.min(requestedMaxBatchDocuments, absoluteMaxBatchDocuments),
  };
}

export function resolveApiServerConfig(env: NodeJS.ProcessEnv = process.env): ApiServerConfig {
  const cloudRuntime = Boolean(env.K_SERVICE?.trim());
  const host = env.HOST?.trim() || (cloudRuntime ? DEFAULT_CLOUD_API_HOST : DEFAULT_LOCAL_API_HOST);
  const port = parsePort(env.PORT, DEFAULT_API_PORT);
  return { host, port, cloudRuntime };
}

export function resolveApiRepositoryConfig(env: NodeJS.ProcessEnv = process.env): ApiRepositoryConfig {
  const raw = env.API_TEMPLATE_REPOSITORY_MODE?.trim().toLowerCase();
  if (!raw) return { mode: DEFAULT_TEMPLATE_REPOSITORY_MODE };
  if (raw === 'filesystem' || raw === 'cloud') return { mode: raw };
  throw Object.assign(
    new Error('API_TEMPLATE_REPOSITORY_MODE must be "filesystem" or "cloud".'),
    { code: 'INVALID_TEMPLATE_REPOSITORY_MODE', details: { value: env.API_TEMPLATE_REPOSITORY_MODE } },
  );
}


export function resolveApiAuthConfig(env: NodeJS.ProcessEnv = process.env): ApiAuthConfig {
  const rawMode = env.API_AUTH_MODE?.trim().toLowerCase();
  const mode: ApiAuthMode = !rawMode ? DEFAULT_API_AUTH_MODE
    : rawMode === 'disabled' || rawMode === 'static-bearer' || rawMode === 'identity-platform' || rawMode === 'hybrid' ? rawMode
    : (()=>{ throw Object.assign(new Error('API_AUTH_MODE must be "disabled", "static-bearer", "identity-platform", or "hybrid".'), { code:'INVALID_API_AUTH_MODE', details:{ value:env.API_AUTH_MODE } }); })();

  const identityAllowedEmails = (env.API_AUTH_IDENTITY_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((value)=>value.trim().toLowerCase())
    .filter(Boolean);
  const identityRequireEmailVerified = env.API_AUTH_IDENTITY_REQUIRE_EMAIL_VERIFIED?.trim().toLowerCase() !== 'false';

  if (mode === 'disabled') return { mode, identityAllowedEmails, identityRequireEmailVerified };

  const staticBearerToken = env.API_AUTH_STATIC_BEARER_TOKEN?.trim();
  if ((mode === 'static-bearer' || mode === 'hybrid') && !staticBearerToken) {
    throw Object.assign(
      new Error('API_AUTH_STATIC_BEARER_TOKEN is required when API_AUTH_MODE uses static bearer authentication.'),
      { code:'MISSING_API_AUTH_TOKEN' },
    );
  }

  const identityProjectId = env.API_AUTH_IDENTITY_PROJECT_ID?.trim();
  if ((mode === 'identity-platform' || mode === 'hybrid') && !identityProjectId) {
    throw Object.assign(
      new Error('API_AUTH_IDENTITY_PROJECT_ID is required when API_AUTH_MODE uses Identity Platform authentication.'),
      { code:'MISSING_IDENTITY_PROJECT_ID' },
    );
  }

  return {
    mode,
    ...(staticBearerToken ? { staticBearerToken } : {}),
    ...(identityProjectId ? { identityProjectId } : {}),
    identityAllowedEmails,
    identityRequireEmailVerified,
  };
}


export function assertSecureCloudAuthConfig(server: ApiServerConfig, auth: ApiAuthConfig): void {
  if (server.cloudRuntime && auth.mode === 'disabled') {
    throw Object.assign(
      new Error('Hosted Cloud Run runtime requires API authentication to be enabled.'),
      { code:'INSECURE_CLOUD_AUTH_CONFIG' },
    );
  }
}


export function resolveApiRateLimitConfig(env: NodeJS.ProcessEnv = process.env): ApiRateLimitConfig {
  const requestedPerMinute = parsePositiveInteger(env.API_RATE_LIMIT_PER_MINUTE, DEFAULT_API_RATE_LIMIT_PER_MINUTE);
  const absolutePerMinute = parsePositiveInteger(env.API_ABSOLUTE_RATE_LIMIT_PER_MINUTE, DEFAULT_API_ABSOLUTE_RATE_LIMIT_PER_MINUTE);
  return {
    requestedPerMinute,
    absolutePerMinute,
    effectivePerMinute: Math.min(requestedPerMinute, absolutePerMinute),
    windowMs: 60_000,
  };
}
