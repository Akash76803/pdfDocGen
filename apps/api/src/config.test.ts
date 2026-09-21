import { describe, expect, it } from 'vitest';
import {
  DEFAULT_API_ABSOLUTE_MAX_BODY_MB,
  DEFAULT_API_MAX_BODY_MB,
  DEFAULT_API_PORT,
  DEFAULT_CLOUD_API_HOST,
  DEFAULT_LOCAL_API_HOST,
  resolveApiBodyLimitConfig,
  resolveApiRepositoryConfig,
  resolveApiServerConfig,
} from './config.js';

describe('DB-6B API body limit configuration', () => {
  it('uses safe defaults when environment values are absent', () => {
    expect(resolveApiBodyLimitConfig({})).toMatchObject({
      requestedLimitMb: DEFAULT_API_MAX_BODY_MB,
      absoluteMaxMb: DEFAULT_API_ABSOLUTE_MAX_BODY_MB,
      effectiveLimitMb: DEFAULT_API_MAX_BODY_MB,
    });

describe('CLOUD-1 template repository configuration', () => {
  it('defaults to filesystem mode for local/offline compatibility', () => {
    expect(resolveApiRepositoryConfig({})).toEqual({ mode: 'filesystem' });
  });

  it('allows explicit persistent cloud repository mode', () => {
    expect(resolveApiRepositoryConfig({ API_TEMPLATE_REPOSITORY_MODE: 'cloud' })).toEqual({ mode: 'cloud' });
  });

  it('normalizes explicit filesystem mode', () => {
    expect(resolveApiRepositoryConfig({ API_TEMPLATE_REPOSITORY_MODE: '  FILESYSTEM  ' })).toEqual({ mode: 'filesystem' });
  });

  it('fails fast for an invalid repository mode', () => {
    expect(() => resolveApiRepositoryConfig({ API_TEMPLATE_REPOSITORY_MODE: 'memory' })).toThrow(
      'API_TEMPLATE_REPOSITORY_MODE must be "filesystem" or "cloud".',
    );
  });
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

describe('CLOUD-1 API server configuration', () => {
  it('keeps the local API loopback-only by default', () => {
    expect(resolveApiServerConfig({})).toEqual({
      host: DEFAULT_LOCAL_API_HOST,
      port: DEFAULT_API_PORT,
      cloudRuntime: false,
    });
  });

  it('binds to all interfaces when running in Cloud Run', () => {
    expect(resolveApiServerConfig({ K_SERVICE: 'document-builder-api', PORT: '8080' })).toEqual({
      host: DEFAULT_CLOUD_API_HOST,
      port: 8080,
      cloudRuntime: true,
    });
  });

  it('allows an explicit host override in cloud and local runtimes', () => {
    expect(resolveApiServerConfig({ K_SERVICE: 'document-builder-api', HOST: '127.0.0.1', PORT: '9090' })).toEqual({
      host: '127.0.0.1',
      port: 9090,
      cloudRuntime: true,
    });
  });

  it('falls back safely for an invalid port', () => {
    expect(resolveApiServerConfig({ PORT: '99999' })).toMatchObject({
      host: DEFAULT_LOCAL_API_HOST,
      port: DEFAULT_API_PORT,
    });
  });
});
