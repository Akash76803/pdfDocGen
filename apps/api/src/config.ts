export const DEFAULT_API_MAX_BODY_MB = 20;
export const DEFAULT_API_ABSOLUTE_MAX_BODY_MB = 50;
export const DEFAULT_API_PORT = 8787;
export const DEFAULT_LOCAL_API_HOST = '127.0.0.1';
export const DEFAULT_CLOUD_API_HOST = '0.0.0.0';
export const DEFAULT_TEMPLATE_REPOSITORY_MODE = 'filesystem' as const;

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

export type ApiTemplateRepositoryMode = 'filesystem' | 'cloud';

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
