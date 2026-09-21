import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  GenerationServiceUnavailableError,
  type DocumentGenerationService,
  type DocumentOutputFormat,
  type DocumentResponseMode,
  type GenerateDocumentBatchCommand,
  type GenerateDocumentCommand,
} from '@document-tool/generation-core';
import type { PublishTemplateRequest, PublishTemplateResponse } from '@document-tool/contracts';
import { ApiAuthenticationError, ApiAuthorizationError, authenticateRequest, requireCapability, type ApiAuthenticator, type AuthenticatedIncomingMessage } from './auth.js';
import {
  DEFAULT_API_MAX_BATCH_DOCUMENTS,
  resolveApiBodyLimitConfig,
  resolveApiGenerationLimitConfig,
  type ApiBodyLimitConfig,
  type ApiGenerationLimitConfig,
} from './config.js';

export type LocalTemplateFileStore = {
  saveDesktopTemplateEntry(value: unknown): Promise<string>;
  deleteTemplateFile(templateId: string): Promise<void>;
  publishTemplate?(request: PublishTemplateRequest): Promise<PublishTemplateResponse>;
};

export type ApiDependencies = {
  generationService: DocumentGenerationService;
  bodyLimitConfig?: ApiBodyLimitConfig;
  generationLimitConfig?: ApiGenerationLimitConfig;
  templateStore?: LocalTemplateFileStore;
  authenticator?: ApiAuthenticator;
};

type ApiError = { error: { code: string; message: string; details?: unknown } };
type CodedError = Error & { code: string; details?: unknown };

function payloadTooLarge(config: ApiBodyLimitConfig): CodedError {
  return Object.assign(new Error(`Request body exceeds the configured ${config.effectiveLimitMb} MB limit.`), {
    code: 'PAYLOAD_TOO_LARGE',
    details: { configuredLimitMb: config.requestedLimitMb, effectiveLimitMb: config.effectiveLimitMb, absoluteMaxMb: config.absoluteMaxMb },
  });
}

function generationTimeout(config: ApiGenerationLimitConfig): CodedError {
  return Object.assign(new Error(`Document generation exceeded the configured ${config.effectiveTimeoutMs} ms deadline.`), {
    code: 'GENERATION_TIMEOUT',
    details: { configuredTimeoutMs:config.requestedTimeoutMs, effectiveTimeoutMs:config.effectiveTimeoutMs, absoluteTimeoutMs:config.absoluteTimeoutMs },
  });
}

async function withGenerationDeadline<T>(operation: Promise<T>, config: ApiGenerationLimitConfig): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve,reject)=>{
    timer=setTimeout(()=>reject(generationTimeout(config)),config.effectiveTimeoutMs);
    timer.unref?.();
  });
  try { return await Promise.race([operation,deadline]); }
  finally { if (timer) clearTimeout(timer); }
}

const FORMATS = new Set<DocumentOutputFormat>(['pdf','docx-exact','docx-editable']);
const RESPONSE_MODES = new Set<DocumentResponseMode>(['binary','base64']);
const BATCH_OUTPUT_MODES = new Set(['separate','combined'] as const);
const BATCH_PAGE_NUMBERING = new Set(['per-document','global'] as const);
const TEMPLATE_ROUTE = /^\/api\/v1\/templates\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/;
const TEMPLATE_PUBLISH_ROUTE = /^\/api\/v1\/templates\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/publish$/;

function applyCors(req: IncomingMessage, res: ServerResponse) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) || origin === 'tauri://localhost') {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
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
  if (input.templateVersion !== undefined && (!Number.isInteger(input.templateVersion) || Number(input.templateVersion) < 1)) throw Object.assign(new Error('templateVersion must be a positive integer when provided.'), { code:'INVALID_REQUEST' });
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

export function parseGenerateDocumentBatchCommand(value: unknown, maxDocuments = DEFAULT_API_MAX_BATCH_DOCUMENTS): GenerateDocumentBatchCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('Request body must be a JSON object.'), { code:'INVALID_REQUEST' });
  const input = value as Record<string, unknown>;
  const templateId = typeof input.templateId === 'string' ? input.templateId.trim() : '';
  if (!templateId) throw Object.assign(new Error('templateId is required.'), { code:'INVALID_REQUEST' });
  if (input.templateVersion !== undefined && (!Number.isInteger(input.templateVersion) || Number(input.templateVersion) < 1)) throw Object.assign(new Error('templateVersion must be a positive integer when provided.'), { code:'INVALID_REQUEST' });

  const outputRaw = input.output;
  if (!outputRaw || typeof outputRaw !== 'object' || Array.isArray(outputRaw)) throw Object.assign(new Error('output is required.'), { code:'INVALID_REQUEST' });
  const outputObj = outputRaw as Record<string, unknown>;
  const format = outputObj.format;
  if (typeof format !== 'string' || !FORMATS.has(format as DocumentOutputFormat)) throw Object.assign(new Error('output.format must be pdf, docx-exact, or docx-editable.'), { code:'INVALID_REQUEST' });
  const outputMode = outputObj.outputMode;
  if (typeof outputMode !== 'string' || !BATCH_OUTPUT_MODES.has(outputMode as 'separate'|'combined')) throw Object.assign(new Error('output.outputMode must be separate or combined.'), { code:'INVALID_REQUEST' });
  const responseMode = outputObj.responseMode;
  if (responseMode !== undefined && (typeof responseMode !== 'string' || !RESPONSE_MODES.has(responseMode as DocumentResponseMode))) throw Object.assign(new Error('output.responseMode must be binary or base64.'), { code:'INVALID_REQUEST' });
  const pageNumbering = outputObj.pageNumbering;
  if (pageNumbering !== undefined && (typeof pageNumbering !== 'string' || !BATCH_PAGE_NUMBERING.has(pageNumbering as 'per-document'|'global'))) throw Object.assign(new Error('output.pageNumbering must be per-document or global.'), { code:'INVALID_REQUEST' });
  if (outputMode === 'combined' && format !== 'pdf') throw Object.assign(new Error('Combined batch output currently supports PDF only.'), { code:'INVALID_REQUEST' });
  if (outputMode === 'separate' && responseMode === 'binary') throw Object.assign(new Error('Separate batch output returns a JSON file collection; use base64 responseMode or omit responseMode.'), { code:'INVALID_REQUEST' });

  const documentsRaw = input.documents;
  if (!Array.isArray(documentsRaw) || documentsRaw.length === 0) throw Object.assign(new Error('documents must be a non-empty array.'), { code:'INVALID_REQUEST' });
  if (documentsRaw.length > maxDocuments) throw Object.assign(new Error(`documents exceeds the configured maximum of ${maxDocuments}.`), { code:'BATCH_LIMIT_EXCEEDED', details:{ documentCount:documentsRaw.length, maxDocuments } });
  const documents = documentsRaw.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw Object.assign(new Error(`documents[${index}] must be a JSON object.`), { code:'INVALID_REQUEST' });
    const document = item as Record<string, unknown>;
    const data = document.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Object.assign(new Error(`documents[${index}].data must be a JSON object.`), { code:'INVALID_REQUEST' });
    return {
      id: typeof document.id === 'string' ? document.id : undefined,
      fileName: typeof document.fileName === 'string' ? document.fileName : undefined,
      data: data as Record<string, unknown>,
    };
  });

  return {
    templateId,
    templateVersion: typeof input.templateVersion === 'number' ? input.templateVersion : undefined,
    output: {
      format: format as DocumentOutputFormat,
      outputMode: outputMode as 'separate'|'combined',
      fileName: typeof outputObj.fileName === 'string' ? outputObj.fileName : undefined,
      renderMode: outputObj.renderMode === 'exact' ? 'exact' : outputObj.renderMode === 'native-auto' ? 'native-auto' : undefined,
      responseMode: responseMode as DocumentResponseMode | undefined,
      pageNumbering: pageNumbering as 'per-document'|'global'|undefined,
    },
    documents,
  };
}

export function parsePublishTemplateRequest(value: unknown, routeTemplateId: string): PublishTemplateRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('Request body must be a JSON object.'), { code:'INVALID_TEMPLATE_PAYLOAD' });
  const input = value as Record<string, unknown>;
  const templateId = typeof input.templateId === 'string' ? input.templateId.trim() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const version = input.version;
  const expectedVersion = input.expectedVersion;
  const status = input.status;
  const metadata = input.metadata;
  const template = input.template;
  if (!templateId || templateId !== routeTemplateId) throw Object.assign(new Error('templateId must match the URL template id.'), { code:'INVALID_TEMPLATE_PAYLOAD' });
  if (!name) throw Object.assign(new Error('name is required.'), { code:'INVALID_TEMPLATE_PAYLOAD' });
  if (!Number.isInteger(version) || Number(version) < 1) throw Object.assign(new Error('version must be a positive integer.'), { code:'INVALID_TEMPLATE_VERSION' });
  if (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 0)) throw Object.assign(new Error('expectedVersion must be a non-negative integer when provided.'), { code:'INVALID_TEMPLATE_VERSION' });
  if (status !== 'DRAFT' && status !== 'ACTIVE' && status !== 'ARCHIVED') throw Object.assign(new Error('status must be DRAFT, ACTIVE, or ARCHIVED.'), { code:'INVALID_TEMPLATE_STATUS' });
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw Object.assign(new Error('metadata must be a JSON object.'), { code:'INVALID_TEMPLATE_PAYLOAD' });
  if (!template || typeof template !== 'object' || Array.isArray(template) || (template as { id?: unknown }).id !== templateId) throw Object.assign(new Error('template must be a matching desktop template entry.'), { code:'INVALID_TEMPLATE_PAYLOAD' });
  return { templateId, name, version:Number(version), ...(expectedVersion === undefined ? {} : { expectedVersion:Number(expectedVersion) }), status, metadata:metadata as Record<string, unknown>, template };
}

function errorStatus(code: string) {
  return code === 'PAYLOAD_TOO_LARGE' ? 413
    : code === 'BATCH_LIMIT_EXCEEDED' ? 413
    : code === 'GENERATION_TIMEOUT' ? 504
    : code === 'INVALID_JSON' || code === 'INVALID_REQUEST' || code === 'INVALID_TEMPLATE_PAYLOAD' || code === 'INVALID_TEMPLATE_ID' ? 400
    : code === 'TEMPLATE_NOT_FOUND' ? 404
    : code === 'TEMPLATE_VERSION_CONFLICT' ? 409
    : code === 'CLOUD_PUBLISH_REQUIRED' ? 409
    : code === 'CLOUD_ASSET_NOT_FOUND' ? 404
    : code === 'CLOUD_TEMPLATE_INTEGRITY_FAILED' || code === 'CLOUD_ASSET_INTEGRITY_FAILED' ? 500
    : code === 'INVALID_TEMPLATE_VERSION' || code === 'INVALID_TEMPLATE_STATUS' ? 400
    : code === 'UNSUPPORTED_OUTPUT_FORMAT' || code === 'EXACT_RENDER_UNAVAILABLE' || code === 'EXACT_DOCX_UNAVAILABLE' || code === 'TEMPLATE_RENDER_FAILED' ? 422
    : 500;
}

export function createApiHandler(deps: ApiDependencies) {
  const bodyLimitConfig = deps.bodyLimitConfig ?? resolveApiBodyLimitConfig();
  const generationLimitConfig = deps.generationLimitConfig ?? resolveApiGenerationLimitConfig();
  return async (req: AuthenticatedIncomingMessage, res: ServerResponse) => {
    applyCors(req, res);
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status:'ok', service:'document-builder-api', phase:'CLOUD-5', limits:{ requestBodyMb: bodyLimitConfig.effectiveLimitMb, absoluteMaxMb: bodyLimitConfig.absoluteMaxMb, generationTimeoutMs:generationLimitConfig.effectiveTimeoutMs, maxBatchDocuments:generationLimitConfig.effectiveMaxBatchDocuments } });

    let principal;
    try {
      principal = await authenticateRequest(req, deps.authenticator);
    } catch (error) {
      if (error instanceof ApiAuthenticationError) {
        res.setHeader('www-authenticate', 'Bearer');
        return sendJson(res, 401, { error:{ code:error.code, message:error.message } } satisfies ApiError);
      }
      return sendJson(res, 401, { error:{ code:'UNAUTHORIZED', message:'Authentication is required.' } } satisfies ApiError);
    }

    const publishMatch = TEMPLATE_PUBLISH_ROUTE.exec(url.pathname);
    if (publishMatch && method === 'PUT') {
      try { requireCapability(principal, 'template:publish'); }
      catch (error) { if (error instanceof ApiAuthorizationError) return sendJson(res, 403, { error:{ code:error.code, message:error.message } } satisfies ApiError); throw error; }
      if (!deps.templateStore?.publishTemplate) return sendJson(res, 503, { error:{ code:'TEMPLATE_PUBLISH_UNAVAILABLE', message:'Template publish repository is not configured.' } } satisfies ApiError);
      const templateId = decodeURIComponent(publishMatch[1] ?? '');
      try {
        const request = parsePublishTemplateRequest(await readJson(req, bodyLimitConfig), templateId);
        const result = await deps.templateStore.publishTemplate(request);
        return sendJson(res, result.status === 'published' ? 201 : 200, result);
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error ? String((error as {code:unknown}).code) : 'TEMPLATE_PUBLISH_FAILED';
        const message = error instanceof Error ? error.message : 'Template publish failed.';
        const details = typeof error === 'object' && error && 'details' in error ? (error as { details?: unknown }).details : undefined;
        return sendJson(res, errorStatus(code), { error:{ code, message, ...(details === undefined ? {} : { details }) } } satisfies ApiError);
      }
    }

    const templateMatch = TEMPLATE_ROUTE.exec(url.pathname);
    if (templateMatch && (method === 'PUT' || method === 'DELETE')) {
      try { requireCapability(principal, method === 'DELETE' ? 'template:delete' : 'template:write'); }
      catch (error) { if (error instanceof ApiAuthorizationError) return sendJson(res, 403, { error:{ code:error.code, message:error.message } } satisfies ApiError); throw error; }
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

    if (method === 'POST' && url.pathname === '/api/v1/documents/generate/batch') {
      try { requireCapability(principal, 'document:generate-batch'); }
      catch (error) { if (error instanceof ApiAuthorizationError) return sendJson(res, 403, { error:{ code:error.code, message:error.message } } satisfies ApiError); throw error; }
      try {
        const command = parseGenerateDocumentBatchCommand(await readJson(req, bodyLimitConfig),generationLimitConfig.effectiveMaxBatchDocuments);
        if (!deps.generationService.generateBatch) throw new GenerationServiceUnavailableError('Batch document generation adapter is not configured.');
        const result = await withGenerationDeadline(deps.generationService.generateBatch(command),generationLimitConfig);

        if (result.outputMode === 'combined') {
          if (!result.combined) throw Object.assign(new Error('Combined generation completed without a combined file.'), { code:'GENERATION_FAILED' });
          if ((command.output.responseMode ?? 'binary') === 'binary') return sendBinary(res, result.combined);
          return sendJson(res, 200, {
            jobId: result.jobId || randomUUID(),
            status: result.status,
            templateId: result.templateId,
            templateVersion: result.templateVersion,
            output: {
              format: result.format,
              outputMode: result.outputMode,
              fileName: result.combined.fileName,
              contentType: result.combined.contentType,
              sizeBytes: result.combined.bytes.byteLength,
              documentCount: result.documentCount,
              pageCount: result.totalPageCount,
              warnings: result.warnings ?? [],
            },
            documents: result.documents,
            file: { encoding:'base64', content:Buffer.from(result.combined.bytes).toString('base64') },
          });
        }

        const files = result.files ?? [];
        return sendJson(res, 200, {
          jobId: result.jobId || randomUUID(),
          status: result.status,
          templateId: result.templateId,
          templateVersion: result.templateVersion,
          output: {
            format: result.format,
            outputMode: result.outputMode,
            documentCount: result.documentCount,
            pageCount: result.totalPageCount,
            warnings: result.warnings ?? [],
          },
          documents: result.documents,
          files: files.map((file, index) => ({
            id: result.documents[index]?.id ?? `document-${index + 1}`,
            format: file.format,
            fileName: file.fileName,
            contentType: file.contentType,
            sizeBytes: file.bytes.byteLength,
            pageCount: file.pageCount,
            warnings: file.warnings ?? [],
            encoding: 'base64',
            content: Buffer.from(file.bytes).toString('base64'),
          })),
        });
      } catch (error) {
        if (error instanceof GenerationServiceUnavailableError) return sendJson(res, 503, { error:{ code:error.code, message:error.message, ...(error.details === undefined ? {} : { details:error.details }) } } satisfies ApiError);
        const code = typeof error === 'object' && error && 'code' in error ? String((error as {code:unknown}).code) : 'GENERATION_FAILED';
        const message = error instanceof Error ? error.message : 'Batch document generation failed.';
        const details = typeof error === 'object' && error && 'details' in error ? (error as { details?: unknown }).details : undefined;
        return sendJson(res, errorStatus(code), { error:{ code, message, ...(details === undefined ? {} : { details }) } } satisfies ApiError);
      }
    }

    if (method !== 'POST' || url.pathname !== '/api/v1/documents/generate') return sendJson(res, 404, { error:{ code:'NOT_FOUND', message:'Route not found.' } } satisfies ApiError);
    try {
      requireCapability(principal, 'document:generate');
      const command = parseGenerateDocumentCommand(await readJson(req, bodyLimitConfig));
      const result = await withGenerationDeadline(deps.generationService.generate(command),generationLimitConfig);
      if ((command.output.responseMode ?? 'binary') === 'binary') return sendBinary(res, result);
      const response = {
        jobId: result.jobId || randomUUID(), status: result.status, templateId: result.templateId, templateVersion: result.templateVersion,
        output: { format: result.format, fileName: result.fileName, contentType: result.contentType, sizeBytes: result.bytes.byteLength, pageCount: result.pageCount, warnings: result.warnings ?? [] },
        file: { encoding:'base64', content: Buffer.from(result.bytes).toString('base64') },
      };
      return sendJson(res, 200, response);
    } catch (error) {
      if (error instanceof ApiAuthorizationError) return sendJson(res, 403, { error:{ code:error.code, message:error.message } } satisfies ApiError);
      if (error instanceof GenerationServiceUnavailableError) return sendJson(res, 503, { error:{ code:error.code, message:error.message, ...(error.details === undefined ? {} : { details:error.details }) } } satisfies ApiError);
      const code = typeof error === 'object' && error && 'code' in error ? String((error as {code:unknown}).code) : 'GENERATION_FAILED';
      const message = error instanceof Error ? error.message : 'Document generation failed.';
      const details = typeof error === 'object' && error && 'details' in error ? (error as { details?: unknown }).details : undefined;
      return sendJson(res, errorStatus(code), { error:{ code, message, ...(details === undefined ? {} : { details }) } } satisfies ApiError);
    }
  };
}
