import { describe, expect, it } from 'vitest';
import {
  DEFAULT_API_ABSOLUTE_MAX_BODY_MB,
  DEFAULT_API_MAX_BODY_MB,
  resolveApiBodyLimitConfig,
} from './config.js';

describe('DB-6B API body limit configuration', () => {
  it('uses safe defaults when environment values are absent', () => {
    expect(resolveApiBodyLimitConfig({})).toMatchObject({
      requestedLimitMb: DEFAULT_API_MAX_BODY_MB,
      absoluteMaxMb: DEFAULT_API_ABSOLUTE_MAX_BODY_MB,
      effectiveLimitMb: DEFAULT_API_MAX_BODY_MB,
    });
  });

  it('uses runtime environment values instead of a route-level hardcoded limit', () => {
    expect(resolveApiBodyLimitConfig({ API_MAX_BODY_MB: '32', API_ABSOLUTE_MAX_BODY_MB: '64' })).toMatchObject({
      requestedLimitMb: 32,
      absoluteMaxMb: 64,
      effectiveLimitMb: 32,
    });
  });

  it('clamps the requested limit to the configured absolute maximum', () => {
    expect(resolveApiBodyLimitConfig({ API_MAX_BODY_MB: '80', API_ABSOLUTE_MAX_BODY_MB: '50' })).toMatchObject({
      requestedLimitMb: 80,
      absoluteMaxMb: 50,
      effectiveLimitMb: 50,
    });
  });

  it('falls back safely for invalid values', () => {
    expect(resolveApiBodyLimitConfig({ API_MAX_BODY_MB: 'nope', API_ABSOLUTE_MAX_BODY_MB: '-5' })).toMatchObject({
      requestedLimitMb: DEFAULT_API_MAX_BODY_MB,
      absoluteMaxMb: DEFAULT_API_ABSOLUTE_MAX_BODY_MB,
      effectiveLimitMb: DEFAULT_API_MAX_BODY_MB,
    });
  });
});
