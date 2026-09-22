import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiPrincipal } from './auth.js';

export type ApiRequestLogEntry = {
  event: 'api_request_completed';
  service: 'document-builder-api';
  requestId: string;
  correlationId?: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  principal?: {
    subject: string;
    authType: ApiPrincipal['authType'];
    roles: string[];
    clientId?: string;
    tenantId?: string;
  };
};

export type ApiLogger = (entry: ApiRequestLogEntry) => void;

export type ObservableIncomingMessage = IncomingMessage & {
  apiPrincipal?: ApiPrincipal;
  apiRequestId?: string;
  apiCorrelationId?: string;
};

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function readSafeCorrelationId(req: IncomingMessage): string | undefined {
  const value = req.headers['x-correlation-id'];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return SAFE_CORRELATION_ID.test(trimmed) ? trimmed : undefined;
}

export function defaultApiLogger(entry: ApiRequestLogEntry): void {
  console.log(JSON.stringify(entry));
}

export function attachRequestObservability(
  req: ObservableIncomingMessage,
  res: ServerResponse,
  logger: ApiLogger = defaultApiLogger,
): void {
  const startedAt = process.hrtime.bigint();
  const requestId = randomUUID();
  const correlationId = readSafeCorrelationId(req);

  req.apiRequestId = requestId;
  if (correlationId) req.apiCorrelationId = correlationId;

  res.setHeader('x-request-id', requestId);
  if (correlationId) res.setHeader('x-correlation-id', correlationId);

  res.once('finish', () => {
    const durationNs = process.hrtime.bigint() - startedAt;
    const durationMs = Math.max(0, Number(durationNs / 1_000_000n));
    const url = new URL(req.url ?? '/', 'http://localhost');
    const principal = req.apiPrincipal;

    logger({
      event: 'api_request_completed',
      service: 'document-builder-api',
      requestId,
      ...(correlationId ? { correlationId } : {}),
      method: req.method ?? 'GET',
      path: url.pathname,
      statusCode: res.statusCode,
      durationMs,
      ...(principal ? {
        principal: {
          subject: principal.subject,
          authType: principal.authType,
          roles: [...principal.roles],
          ...(principal.clientId ? { clientId: principal.clientId } : {}),
          ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
        },
      } : {}),
    });
  });
}
