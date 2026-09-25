import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(filePath) {
  if (existsSync(filePath)) {
    const lines = readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'));
loadEnvFile(resolve(process.cwd(), '../desktop/.env.local'));

process.env.API_AUTH_MODE = process.env.API_AUTH_MODE || 'token-hybrid';
process.env.API_AUTH_STATIC_BEARER_TOKEN = process.env.API_AUTH_STATIC_BEARER_TOKEN || 'test-salesforce-bootstrap-token';
process.env.API_AUTH_GOOGLE_CLIENT_ID = process.env.API_AUTH_GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '933068485086-ptvjm6oadb4a0s7gpi4df35i8kv1bbn8.apps.googleusercontent.com';
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.PORT = process.env.PORT || '8787';

import('./dist/server.js');
