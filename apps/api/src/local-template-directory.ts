import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const DOCUMENT_TOOL_IDENTIFIER = 'com.documenttool.app';

export function resolveSharedTemplateDirectory(env: NodeJS.ProcessEnv = process.env): string {
  if (env.API_TEMPLATE_DIR?.trim()) return resolve(env.API_TEMPLATE_DIR.trim());

  if (process.platform === 'win32') {
    const appData = env.APPDATA?.trim();
    if (appData) return join(appData, DOCUMENT_TOOL_IDENTIFIER, 'templates');
  }

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', DOCUMENT_TOOL_IDENTIFIER, 'templates');
  }

  const xdgData = env.XDG_DATA_HOME?.trim() || join(homedir(), '.local', 'share');
  return join(xdgData, DOCUMENT_TOOL_IDENTIFIER, 'templates');
}

export function resolveBundledTemplateDirectory(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.API_FALLBACK_TEMPLATE_DIR?.trim() || './data/templates');
}
