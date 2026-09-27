import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('Saved desktop template filesystem permissions', () => {
  it('allows listing and reading template JSON from the Tauri app-data directory', () => {
    const configPath = fileURLToPath(new URL('../../src-tauri/tauri.conf.json', import.meta.url));
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      tauri: { allowlist: { fs: { readDir?: boolean; readFile?: boolean; scope?: string[] } } };
    };
    expect(config.tauri.allowlist.fs.readDir).toBe(true);
    expect(config.tauri.allowlist.fs.readFile).toBe(true);
    expect(config.tauri.allowlist.fs.scope).toContain('$APPDATA/**');
  });
});
