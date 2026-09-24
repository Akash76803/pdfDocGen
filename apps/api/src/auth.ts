import { createPublicKey, timingSafeEqual, verify as verifySignature } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { parseApiToken, verifyApiTokenSecret, type ApiTokenStore } from './api-token-store.js';

export type ApiPrincipal = {
  subject: string;
  clientId?: string;
  tenantId?: string;
  email?: string;
  roles: string[];
  authType: 'oidc' | 'service-account' | 'api-key';
};

export type AuthenticatedIncomingMessage = IncomingMessage & {
  apiPrincipal?: ApiPrincipal;
};

export type ApiAuthenticator = {
  authenticate(req: IncomingMessage): Promise<ApiPrincipal>;
};

export class ApiAuthenticationError extends Error {
  readonly code = 'UNAUTHORIZED';
  constructor(message = 'Authentication is required.') {
    super(message);
  }
}

export type StaticBearerAuthenticatorOptions = {
  token: string;
  principal?: ApiPrincipal;
};

function readBearerToken(req: IncomingMessage): string {
  const gatewayClientHeader = req.headers['x-pdfdocgen-authorization'];
  const forwardedHeader = req.headers['x-forwarded-authorization'];
  const header = typeof gatewayClientHeader === 'string'
    ? gatewayClientHeader
    : typeof forwardedHeader === 'string'
      ? forwardedHeader
      : req.headers.authorization;
  if (typeof header !== 'string') throw new ApiAuthenticationError();
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) throw new ApiAuthenticationError();
  return match[1];
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

export function createStaticBearerAuthenticator(options: StaticBearerAuthenticatorOptions): ApiAuthenticator {
  const expectedToken = options.token;
  if (!expectedToken) throw new Error('Static bearer authentication requires a non-empty token.');
  const principal = options.principal ?? {
    subject: 'static-api-client',
    roles: ['publisher', 'generator'],
    authType: 'api-key' as const,
  };

  return {
    async authenticate(req) {
      const token = readBearerToken(req);
      if (!safeEqual(token, expectedToken)) throw new ApiAuthenticationError();
      return principal;
    },
  };
}

type IdentityPlatformJwtHeader = {
  alg?: string;
  kid?: string;
};

type IdentityPlatformJwtClaims = {
  aud?: string;
  iss?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  exp?: number;
  iat?: number;
};

export type IdentityPlatformAuthenticatorOptions = {
  projectId: string;
  allowedEmails?: readonly string[];
  requireEmailVerified?: boolean;
  roles?: readonly string[];
  fetchImpl?: typeof fetch;
  now?: () => number;
};

const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

function decodeBase64UrlJson<T>(value: string): T {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    throw new ApiAuthenticationError('Identity token is malformed.');
  }
}

function parseMaxAge(cacheControl: string | null): number {
  const match = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl ?? '');
  return match ? Math.max(60, Number(match[1])) : 3600;
}

export function createIdentityPlatformAuthenticator(options: IdentityPlatformAuthenticatorOptions): ApiAuthenticator {
  const projectId = options.projectId.trim();
  if (!projectId) throw new Error('Identity Platform authentication requires a project ID.');
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const allowedEmails = new Set((options.allowedEmails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean));
  const requireEmailVerified = options.requireEmailVerified ?? true;
  const roles = [...(options.roles ?? ['publisher'])];

  let certs = new Map<string,string>();
  let certsExpireAt = 0;

  async function certificateFor(kid: string): Promise<string> {
    const nowMs = Date.now();
    if (nowMs >= certsExpireAt || !certs.has(kid)) {
      const response = await fetchImpl(FIREBASE_CERTS_URL);
      if (!response.ok) throw new ApiAuthenticationError('Unable to verify identity token.');
      const body = await response.json() as Record<string,string>;
      certs = new Map(Object.entries(body));
      certsExpireAt = nowMs + parseMaxAge(response.headers.get('cache-control')) * 1000;
    }
    const certificate = certs.get(kid);
    if (!certificate) throw new ApiAuthenticationError('Identity token signing key is not recognized.');
    return certificate;
  }

  return {
    async authenticate(req) {
      const token = readBearerToken(req);
      const segments = token.split('.');
      if (segments.length !== 3) throw new ApiAuthenticationError();

      const header = decodeBase64UrlJson<IdentityPlatformJwtHeader>(segments[0]!);
      const claims = decodeBase64UrlJson<IdentityPlatformJwtClaims>(segments[1]!);
      if (header.alg !== 'RS256' || !header.kid) throw new ApiAuthenticationError('Identity token algorithm is invalid.');

      const certificate = await certificateFor(header.kid);
      const validSignature = verifySignature(
        'RSA-SHA256',
        Buffer.from(`${segments[0]}.${segments[1]}`),
        createPublicKey(certificate),
        Buffer.from(segments[2]!, 'base64url'),
      );
      if (!validSignature) throw new ApiAuthenticationError('Identity token signature is invalid.');

      const timestamp = now();
      if (claims.aud !== projectId) throw new ApiAuthenticationError('Identity token audience is invalid.');
      if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new ApiAuthenticationError('Identity token issuer is invalid.');
      if (!claims.sub || claims.sub.length > 128) throw new ApiAuthenticationError('Identity token subject is invalid.');
      if (typeof claims.exp !== 'number' || claims.exp <= timestamp - 30) throw new ApiAuthenticationError('Identity token has expired.');
      if (typeof claims.iat !== 'number' || claims.iat > timestamp + 30) throw new ApiAuthenticationError('Identity token issue time is invalid.');
      if (requireEmailVerified && claims.email && claims.email_verified !== true) throw new ApiAuthenticationError('A verified email is required.');
      if (allowedEmails.size > 0) {
        const email = claims.email?.trim().toLowerCase();
        if (!email || !allowedEmails.has(email)) throw new ApiAuthenticationError('This account is not allowed to publish templates.');
      }

      return {
        subject: claims.sub,
        ...(claims.email ? { email:claims.email } : {}),
        roles,
        authType:'oidc' as const,
      };
    },
  };
}


export function createIssuedApiTokenAuthenticator(store: ApiTokenStore): ApiAuthenticator {
  return {
    async authenticate(req) {
      const raw=readBearerToken(req);
      const parsed=parseApiToken(raw);
      if(!parsed) throw new ApiAuthenticationError();
      const record=await store.get(parsed.tokenId);
      if(!record || record.revokedAt || !verifyApiTokenSecret(parsed.secret,record.secretHash)) throw new ApiAuthenticationError();
      void store.touch(record.id,new Date().toISOString()).catch(()=>undefined);
      return {
        subject:record.ownerSubject,
        clientId:record.id,
        ...(record.ownerEmail ? {email:record.ownerEmail}:{}),
        roles:['publisher','generator'],
        authType:'api-key' as const,
      };
    },
  };
}

export function createCompositeAuthenticator(authenticators: readonly ApiAuthenticator[]): ApiAuthenticator {
  if (authenticators.length === 0) throw new Error('Composite authentication requires at least one authenticator.');
  return {
    async authenticate(req) {
      let lastError: unknown;
      for (const authenticator of authenticators) {
        try {
          return await authenticator.authenticate(req);
        } catch (error) {
          if (!(error instanceof ApiAuthenticationError)) throw error;
          lastError = error;
        }
      }
      throw lastError instanceof ApiAuthenticationError ? lastError : new ApiAuthenticationError();
    },
  };
}

export async function authenticateRequest(
  req: AuthenticatedIncomingMessage,
  authenticator?: ApiAuthenticator,
): Promise<ApiPrincipal | undefined> {
  if (!authenticator) return undefined;
  const principal = await authenticator.authenticate(req);
  req.apiPrincipal = principal;
  return principal;
}

export type ApiCapability =
  | 'template:publish'
  | 'template:write'
  | 'template:delete'
  | 'document:generate'
  | 'document:generate-batch';

const ROLE_CAPABILITIES: Record<string, ReadonlySet<ApiCapability>> = {
  publisher: new Set<ApiCapability>(['template:publish','template:write']),
  generator: new Set<ApiCapability>(['document:generate','document:generate-batch']),
  admin: new Set<ApiCapability>(['template:publish','template:write','template:delete','document:generate','document:generate-batch']),
};

export class ApiAuthorizationError extends Error {
  readonly code = 'FORBIDDEN';
  constructor(message = 'The authenticated caller is not allowed to perform this operation.') {
    super(message);
  }
}

export function hasCapability(principal: ApiPrincipal, capability: ApiCapability): boolean {
  return principal.roles.some((role)=>ROLE_CAPABILITIES[role]?.has(capability) ?? false);
}

export function requireCapability(principal: ApiPrincipal | undefined, capability: ApiCapability): void {
  if (!principal) return;
  if (!hasCapability(principal, capability)) throw new ApiAuthorizationError();
}
