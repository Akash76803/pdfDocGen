export const DEFAULT_API_MAX_BODY_MB = 20;
export const DEFAULT_API_ABSOLUTE_MAX_BODY_MB = 50;

export type ApiBodyLimitConfig = {
  requestedLimitMb: number;
  absoluteMaxMb: number;
  effectiveLimitMb: number;
  effectiveLimitBytes: number;
};

function parsePositiveMb(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
