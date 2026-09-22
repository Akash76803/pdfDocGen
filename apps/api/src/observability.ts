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

export type ApiOperationLogEntry = {
  event: 'api_operation';
  service: 'document-builder-api';
  requestId?: string;
  correlationId?: string;
  operation: 'document.generate' | 'document.generate-batch' | 'template.publish' | 'template.write' | 'template.delete';
  outcome: 'success' | 'failure';
  statusCode: number;
  durationMs: number;
  templateId?: string;
  templateVersion?: number;
  format?: string;
  documentCount?: number;
  errorCode?: string;
};

export type ApiMetricLogEntry = {
  event: 'api_metric';
  service: 'document-builder-api';
  metric:
    | 'api.request.count'
    | 'api.request.error_count'
    | 'api.request.duration_ms'
    | 'api.operation.count'
    | 'api.operation.failure_count'
    | 'api.operation.duration_ms';
  value: number;
  labels: Record<string,string>;
};

export type ApiLogEntry = ApiRequestLogEntry | ApiOperationLogEntry | ApiMetricLogEntry;
export type ApiLogger = (entry: ApiLogEntry) => void;

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

export function defaultApiLogger(entry: ApiLogEntry): void {
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


export function emitApiOperationLog(
  req: ObservableIncomingMessage,
  logger: ApiLogger = defaultApiLogger,
  entry: Omit<ApiOperationLogEntry,'event'|'service'|'requestId'|'correlationId'>,
): void {
  logger({
    event:'api_operation',
    service:'document-builder-api',
    ...(req.apiRequestId ? {requestId:req.apiRequestId} : {}),
    ...(req.apiCorrelationId ? {correlationId:req.apiCorrelationId} : {}),
    ...entry,
  });
}


export function createMonitoringLogger(baseLogger: ApiLogger = defaultApiLogger): ApiLogger {
  return (entry) => {
    baseLogger(entry);

    if (entry.event === 'api_request_completed') {
      const labels = {
        method: entry.method,
        path: entry.path,
        statusClass: `${Math.floor(entry.statusCode / 100)}xx`,
      };
      baseLogger({event:'api_metric',service:'document-builder-api',metric:'api.request.count',value:1,labels});
      baseLogger({event:'api_metric',service:'document-builder-api',metric:'api.request.duration_ms',value:entry.durationMs,labels});
      if (entry.statusCode >= 400) {
        baseLogger({event:'api_metric',service:'document-builder-api',metric:'api.request.error_count',value:1,labels});
      }
      return;
    }

    if (entry.event === 'api_operation') {
      const labels = {
        operation: entry.operation,
        outcome: entry.outcome,
        statusClass: `${Math.floor(entry.statusCode / 100)}xx`,
        ...(entry.format ? {format:entry.format} : {}),
        ...(entry.errorCode ? {errorCode:entry.errorCode} : {}),
      };
      baseLogger({event:'api_metric',service:'document-builder-api',metric:'api.operation.count',value:1,labels});
      baseLogger({event:'api_metric',service:'document-builder-api',metric:'api.operation.duration_ms',value:entry.durationMs,labels});
      if (entry.outcome === 'failure') {
        baseLogger({event:'api_metric',service:'document-builder-api',metric:'api.operation.failure_count',value:1,labels});
      }
    }
  };
}
