import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export type ApiPrincipal = {
  subject: string;
  clientId?: string;
  tenantId?: string;
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
  const header = req.headers.authorization;
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

export async function authenticateRequest(
  req: AuthenticatedIncomingMessage,
  authenticator?: ApiAuthenticator,
): Promise<ApiPrincipal | undefined> {
  if (!authenticator) return undefined;
  const principal = await authenticator.authenticate(req);
  req.apiPrincipal = principal;
  return principal;
}
