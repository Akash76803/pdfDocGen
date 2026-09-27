import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Saved desktop template filesystem permissions', () => {
  it('allows listing and reading template JSON from the Tauri app-data directory', () => {
    const rootPath = resolve(process.cwd(), 'apps/desktop/src-tauri/tauri.conf.json');
    const workspacePath = resolve(process.cwd(), 'src-tauri/tauri.conf.json');
    const configPath = existsSync(rootPath) ? rootPath : workspacePath;
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      tauri: { allowlist: { fs: { readDir?: boolean; readFile?: boolean; scope?: string[] } } };
    };
    expect(config.tauri.allowlist.fs.readDir).toBe(true);
    expect(config.tauri.allowlist.fs.readFile).toBe(true);
    expect(config.tauri.allowlist.fs.scope).toContain('$APPDATA/**');
  });
});
