process.env.API_AUTH_MODE = process.env.API_AUTH_MODE || 'token-hybrid';
process.env.API_AUTH_STATIC_BEARER_TOKEN = process.env.API_AUTH_STATIC_BEARER_TOKEN || 'test-salesforce-bootstrap-token';
process.env.API_AUTH_GOOGLE_CLIENT_ID = process.env.API_AUTH_GOOGLE_CLIENT_ID || '933068485086-ptvjm6oadb4a0s7gpi4df35i8kv1bbn8.apps.googleusercontent.com';
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.PORT = process.env.PORT || '8787';

import('./dist/server.js');
