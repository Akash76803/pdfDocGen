import { describe, expect, it } from 'vitest';
import { buildApiStartupDiagnostics, formatApiStartupDiagnostics } from './startup-diagnostics.js';

describe('CLOUD-1 startup diagnostics', () => {
  it('reports runtime/config values without environment secrets', () => {
    const diagnostics = buildApiStartupDiagnostics(
      { host:'0.0.0.0', port:8080, cloudRuntime:true },
      { mode:'filesystem' },
      { requestedLimitMb:20, absoluteMaxMb:50, effectiveLimitMb:20, effectiveLimitBytes:20 * 1024 * 1024 },
    );

    expect(diagnostics).toEqual({
      runtime:'cloud',
      host:'0.0.0.0',
      port:8080,
      repositoryMode:'filesystem',
      requestBodyMb:20,
      absoluteMaxBodyMb:50,
    });

    const line = formatApiStartupDiagnostics(diagnostics);
    expect(JSON.parse(line)).toMatchObject({
      event:'api_startup',
      service:'document-builder-api',
      runtime:'cloud',
      repositoryMode:'filesystem',
    });
    expect(line).not.toContain('token');
    expect(line).not.toContain('secret');
    expect(line).not.toContain('password');
  });
});
