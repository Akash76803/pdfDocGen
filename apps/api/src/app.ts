import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  GenerationServiceUnavailableError,
  type DocumentGenerationService,
  type DocumentOutputFormat,
  type DocumentResponseMode,
  type GenerateDocumentCommand,
} from '@document-tool/generation-core';
import { resolveApiBodyLimitConfig, type ApiBodyLimitConfig } from './config.js';

export type LocalTemplateFileStore = {
  saveDesktopTemplateEntry(value: unknown): Promise<string>;
  deleteTemplateFile(templateId: string): Promise<void>;
};

export type ApiDependencies = {
  generationService: DocumentGenerationService;
  bodyLimitConfig?: ApiBodyLimitConfig;
  templateStore?: LocalTemplateFileStore;
};

type ApiError = { error: { code: string; message: string; details?: unknown } };
type CodedError = Error & { code: string; details?: unknown };

function payloadTooLarge(config: ApiBodyLimitConfig): CodedError {
  return Object.assign(new Error(`Request body exceeds the configured ${config.effectiveLimitMb} MB limit.`), {
    code: 'PAYLOAD_TOO_LARGE',
    details: { configuredLimitMb: config.requestedLimitMb, effectiveLimitMb: config.effectiveLimitMb, absoluteMaxMb: config.absoluteMaxMb },
  });
}

const FORMATS = new Set<DocumentOutputFormat>(['pdf','docx-exact','docx-editable']);
const RESPONSE_MODES = new Set<DocumentResponseMode>(['binary','base64']);
const TEMPLATE_ROUTE = /^\/api\/v1\/templates\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/;

function applyCors(req: IncomingMessage, res: ServerResponse) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) || origin === 'tauri://localhost') {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-expose-headers', 'content-disposition,content-length,x-document-job-id,x-document-template-id,x-document-template-version,x-document-format,x-document-page-count,x-document-warnings');
  }
}

function sendJson(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
}

function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^ -~]+/g, '_').replace(/["\\]/g, '_') || 'document';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function sendBinary(res: ServerResponse, result: Awaited<ReturnType<DocumentGenerationService['generate']>>) {
  const bytes = Buffer.from(result.bytes);
  res.statusCode = 200;
  res.setHeader('content-type', result.contentType);
  res.setHeader('content-disposition', contentDisposition(result.fileName));
  res.setHeader('content-length', String(bytes.byteLength));
  res.setHeader('x-document-job-id', result.jobId || '');
  res.setHeader('x-document-template-id', result.templateId);
  if (result.templateVersion !== undefined) res.setHeader('x-document-template-version', String(result.templateVersion));
  res.setHeader('x-document-format', result.format);
  if (result.pageCount !== undefined) res.setHeader('x-document-page-count', String(result.pageCount));
  if (result.warnings?.length) res.setHeader('x-document-warnings', encodeURIComponent(JSON.stringify(result.warnings)));
  res.end(bytes);
}

async function readJson(req: IncomingMessage, config: ApiBodyLimitConfig): Promise<unknown> {
  const declaredLength = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > config.effectiveLimitBytes) throw payloadTooLarge(config);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > config.effectiveLimitBytes) throw payloadTooLarge(config);
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Request body must be valid JSON.'), { code:'INVALID_JSON' }); }
}

export function parseGenerateDocumentCommand(value: unknown): GenerateDocumentCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('Request body must be a JSON object.'), { code:'INVALID_REQUEST' });
  const input = value as Record<string, unknown>;
  const templateId = typeof input.templateId === 'string' ? input.templateId.trim() : '';
  if (!templateId) throw Object.assign(new Error('templateId is required.'), { code:'INVALID_REQUEST' });
  const outputRaw = input.output;
  if (!outputRaw || typeof outputRaw !== 'object' || Array.isArray(outputRaw)) throw Object.assign(new Error('output is required.'), { code:'INVALID_REQUEST' });
  const outputObj = outputRaw as Record<string, unknown>;
  const format = outputObj.format;
  if (typeof format !== 'string' || !FORMATS.has(format as DocumentOutputFormat)) throw Object.assign(new Error('output.format must be pdf, docx-exact, or docx-editable.'), { code:'INVALID_REQUEST' });
  const responseMode = outputObj.responseMode;
  if (responseMode !== undefined && (typeof responseMode !== 'string' || !RESPONSE_MODES.has(responseMode as DocumentResponseMode))) throw Object.assign(new Error('output.responseMode must be binary or base64.'), { code:'INVALID_REQUEST' });
  const data = input.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Object.assign(new Error('data must be a JSON object.'), { code:'INVALID_REQUEST' });
  return {
    templateId,
    templateVersion: typeof input.templateVersion === 'number' ? input.templateVersion : undefined,
    output: {
      format: format as DocumentOutputFormat,
      fileName: typeof outputObj.fileName === 'string' ? outputObj.fileName : undefined,
      renderMode: outputObj.renderMode === 'exact' ? 'exact' : outputObj.renderMode === 'native-auto' ? 'native-auto' : undefined,
      responseMode: responseMode as DocumentResponseMode | undefined,
    },
    data: data as Record<string, unknown>,
  };
}

function errorStatus(code: string) {
  return code === 'PAYLOAD_TOO_LARGE' ? 413
    : code === 'INVALID_JSON' || code === 'INVALID_REQUEST' || code === 'INVALID_TEMPLATE_PAYLOAD' || code === 'INVALID_TEMPLATE_ID' ? 400
    : code === 'TEMPLATE_NOT_FOUND' ? 404
    : code === 'UNSUPPORTED_OUTPUT_FORMAT' || code === 'EXACT_RENDER_UNAVAILABLE' || code === 'EXACT_DOCX_UNAVAILABLE' || code === 'TEMPLATE_RENDER_FAILED' ? 422
    : 500;
}

export function createApiHandler(deps: ApiDependencies) {
  const bodyLimitConfig = deps.bodyLimitConfig ?? resolveApiBodyLimitConfig();
  return async (req: IncomingMessage, res: ServerResponse) => {
    applyCors(req, res);
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status:'ok', service:'document-builder-api', phase:'DB-6B', limits:{ requestBodyMb: bodyLimitConfig.effectiveLimitMb, absoluteMaxMb: bodyLimitConfig.absoluteMaxMb } });

    const templateMatch = TEMPLATE_ROUTE.exec(url.pathname);
    if (templateMatch && (method === 'PUT' || method === 'DELETE')) {
      if (!deps.templateStore) return sendJson(res, 503, { error:{ code:'TEMPLATE_STORE_UNAVAILABLE', message:'Local template file store is not configured.' } } satisfies ApiError);
      const templateId = decodeURIComponent(templateMatch[1] ?? '');
      try {
        if (method === 'DELETE') {
          await deps.templateStore.deleteTemplateFile(templateId);
          return sendJson(res, 200, { status:'deleted', templateId });
        }
        const payload = await readJson(req, bodyLimitConfig);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || (payload as { id?: unknown }).id !== templateId) {
          throw Object.assign(new Error('Template payload id must match the URL template id.'), { code:'INVALID_TEMPLATE_PAYLOAD' });
        }
        await deps.templateStore.saveDesktopTemplateEntry(payload);
        return sendJson(res, 200, { status:'saved', templateId });
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error ? String((error as {code:unknown}).code) : 'TEMPLATE_SAVE_FAILED';
        const message = error instanceof Error ? error.message : 'Template operation failed.';
        return sendJson(res, errorStatus(code), { error:{ code, message } } satisfies ApiError);
      }
    }

    if (method !== 'POST' || url.pathname !== '/api/v1/documents/generate') return sendJson(res, 404, { error:{ code:'NOT_FOUND', message:'Route not found.' } } satisfies ApiError);
    try {
      const command = parseGenerateDocumentCommand(await readJson(req, bodyLimitConfig));
      const result = await deps.generationService.generate(command);
      if ((command.output.responseMode ?? 'binary') === 'binary') return sendBinary(res, result);
      const response = {
        jobId: result.jobId || randomUUID(), status: result.status, templateId: result.templateId, templateVersion: result.templateVersion,
        output: { format: result.format, fileName: result.fileName, contentType: result.contentType, sizeBytes: result.bytes.byteLength, pageCount: result.pageCount, warnings: result.warnings ?? [] },
        file: { encoding:'base64', content: Buffer.from(result.bytes).toString('base64') },
      };
      return sendJson(res, 200, response);
    } catch (error) {
      if (error instanceof GenerationServiceUnavailableError) return sendJson(res, 503, { error:{ code:error.code, message:error.message, ...(error.details === undefined ? {} : { details:error.details }) } } satisfies ApiError);
      const code = typeof error === 'object' && error && 'code' in error ? String((error as {code:unknown}).code) : 'GENERATION_FAILED';
      const message = error instanceof Error ? error.message : 'Document generation failed.';
      const details = typeof error === 'object' && error && 'details' in error ? (error as { details?: unknown }).details : undefined;
      return sendJson(res, errorStatus(code), { error:{ code, message, ...(details === undefined ? {} : { details }) } } satisfies ApiError);
    }
  };
}
