process.env.API_AUTH_MODE = process.env.API_AUTH_MODE || 'token-hybrid';

if (!process.env.API_AUTH_STATIC_BEARER_TOKEN?.trim()) {
  throw new Error('Missing API_AUTH_STATIC_BEARER_TOKEN for local token-hybrid startup.');
}
if (!process.env.API_AUTH_GOOGLE_CLIENT_ID?.trim()) {
  throw new Error('Missing API_AUTH_GOOGLE_CLIENT_ID for local Google token verification.');
}

process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.PORT = process.env.PORT || '8787';

import('./dist/server.js');
