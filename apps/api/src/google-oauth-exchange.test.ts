import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DocumentGenerationService } from '@document-tool/generation-core';
import { createGoogleOAuthCodeExchanger, validateGoogleAuthorizationGrant } from './google-oauth-exchange.js';
import { ApiAuthenticationError, createStaticBearerAuthenticator, type ApiPrincipal } from './auth.js';
import { createApiHandler } from './app.js';
import { InMemoryApiTokenStore } from './api-token-store.js';

const grant = {
  code: 'sample-authorization-code',
  codeVerifier: 'a'.repeat(64),
  redirectUri: 'http://127.0.0.1:49152/callback',
};
const principal: ApiPrincipal = {
  subject: 'verified-google-subject',
  email: 'test@example.com',
  roles: ['publisher'],
  authType: 'oidc',
};

describe('backend Google authorization-code exchange', () => {
  it('restricts redirect URIs to native ephemeral loopback callbacks and checks PKCE format', () => {
    expect(validateGoogleAuthorizationGrant(grant)).toEqual(grant);
    for (const redirectUri of [
      'https://evil.example/callback', 'http://localhost:49152/callback',
      'http://127.0.0.1:49152/not-callback', 'http://127.0.0.1:49152/callback?evil=1',
      'http://127.0.0.1/callback', 'http://127.0.0.1:49152@evil.example/callback',
    ]) {
      expect(() => validateGoogleAuthorizationGrant({...grant, redirectUri})).toThrow();
    }
    expect(() => validateGoogleAuthorizationGrant({...grant, codeVerifier: 'short'})).toThrow();
    expect(() => validateGoogleAuthorizationGrant({...grant, code: ''})).toThrow();
  });

  it('exchanges PKCE code using only the server secret and verifies Google signed identity', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({id_token:'mock-google-id-token'}), {status:200}),
    );
    const authenticator = {
      authenticate: vi.fn(async (req: import('node:http').IncomingMessage) => {
        expect(req.headers['x-pdfdocgen-authorization']).toBe('Bearer mock-google-id-token');
        return principal;
      }),
    };
    const exchange = createGoogleOAuthCodeExchanger({
      clientId:'desktop-client-id',
      clientSecret:'server-only-secret',
      authenticator,
      fetchImpl,
    });
    expect(await exchange(grant)).toEqual(principal);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, options] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const params = options!.body as URLSearchParams;
    expect(params.get('client_secret')).toBe('server-only-secret');
    expect(params.get('code_verifier')).toBe(grant.codeVerifier);
    expect(params.get('redirect_uri')).toBe(grant.redirectUri);
    expect(authenticator.authenticate).toHaveBeenCalledOnce();
  });

  it('does not leak the upstream OAuth response when Google rejects the code', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({error:'invalid_grant',secret:'SHOULD_NOT_LEAK'}), {status:400}),
    );
    const exchange = createGoogleOAuthCodeExchanger({
      clientId:'desktop-client-id', clientSecret:'server-only-secret',
      authenticator: {authenticate:async()=>principal}, fetchImpl,
    });
    await expect(exchange(grant)).rejects.toMatchObject({
      status:401,code:'GOOGLE_OAUTH_REJECTED',message:'Google verification failed. Please sign in again.',
    });
  });

  it('rejects an identity that fails signature/audience checks', async () => {
    const exchange = createGoogleOAuthCodeExchanger({
      clientId:'desktop-client-id', clientSecret:'server-only-secret',
      authenticator:{authenticate:async()=>{throw new ApiAuthenticationError('Google identity token audience is invalid.');}},
      fetchImpl:vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({id_token:'invalid'}),{status:200}),
      ),
    });
    await expect(exchange(grant)).rejects.toMatchObject({
      status:401,code:'GOOGLE_IDENTITY_REJECTED',
    });
  });
});

const servers: Server[] = [];
afterEach(async()=>{
  await Promise.all(servers.splice(0).map((server)=>new Promise<void>((resolve)=>server.close(()=>resolve()))));
});

async function startAuthApi(exchange?: (grant: typeof grant)=>Promise<ApiPrincipal>) {
  const apiTokenStore = new InMemoryApiTokenStore();
  const generationService:DocumentGenerationService = {generate:async()=>{throw new Error('unused');}};
  const handler = createApiHandler({
    generationService, apiTokenStore,
    authenticator:createStaticBearerAuthenticator({token:'bootstrap-secret'}),
    ...(exchange ? {googleOAuthExchange:exchange} : {}),
  });
  const server = createServer((req,res)=>{void handler(req,res);});
  servers.push(server);
  await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',()=>resolve()));
  const port = (server.address() as AddressInfo).port;
  return {base:`http://127.0.0.1:${port}`, apiTokenStore};
}

describe('public Google OAuth bootstrap endpoint',()=>{
  it('returns 503 when the server-only secret is not configured',async()=>{
    const {base}=await startAuthApi();
    const response=await fetch(`${base}/api/v1/auth/google/exchange`, {
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(grant),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({error:{code:'GOOGLE_OAUTH_NOT_CONFIGURED'}});
  });

  it('rejects untrusted redirect before contacting Google',async()=>{
    const exchange=vi.fn(async()=>principal);
    const {base}=await startAuthApi(exchange);
    const response=await fetch(`${base}/api/v1/auth/google/exchange`, {
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({...grant,redirectUri:'https://evil.example/callback'}),
    });
    expect(response.status).toBe(400);
    expect(exchange).not.toHaveBeenCalled();
  });

  it('issues a reusable token without sending a Google ID token to the Desktop',async()=>{
    const exchange=vi.fn(async()=>principal);
    const {base,apiTokenStore}=await startAuthApi(exchange);
    const response=await fetch(`${base}/api/v1/auth/google/exchange`, {
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({...grant,label:'Desktop + Salesforce'}),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const issued=await response.json() as {token:string; tokenId:string};
    expect(issued.token).toMatch(/^pdfdg_/);
    expect((await apiTokenStore.get(issued.tokenId))?.ownerSubject).toBe(principal.subject);
    expect(exchange).toHaveBeenCalledOnce();
  });
});
