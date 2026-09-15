import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  GenerationServiceUnavailableError,
  type DocumentGenerationService,
  type DocumentOutputFormat,
  type GenerateDocumentCommand,
} from '@document-tool/generation-core';

export type ApiDependencies = { generationService: DocumentGenerationService };

type ApiError = { error: { code: string; message: string; details?: unknown } };

const FORMATS = new Set<DocumentOutputFormat>(['pdf','docx-exact','docx-editable']);

function sendJson(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > 5 * 1024 * 1024) throw Object.assign(new Error('Request body exceeds 5 MB.'), { code:'PAYLOAD_TOO_LARGE' });
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
  const data = input.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Object.assign(new Error('data must be a JSON object.'), { code:'INVALID_REQUEST' });
  return {
    templateId,
    templateVersion: typeof input.templateVersion === 'number' ? input.templateVersion : undefined,
    output: {
      format: format as DocumentOutputFormat,
      fileName: typeof outputObj.fileName === 'string' ? outputObj.fileName : undefined,
      renderMode: outputObj.renderMode === 'exact' ? 'exact' : outputObj.renderMode === 'native-auto' ? 'native-auto' : undefined,
    },
    data: data as Record<string, unknown>,
  };
}

export function createApiHandler(deps: ApiDependencies) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status:'ok', service:'document-builder-api', phase:'DB-6B' });
    if (method !== 'POST' || url.pathname !== '/api/v1/documents/generate') return sendJson(res, 404, { error:{ code:'NOT_FOUND', message:'Route not found.' } } satisfies ApiError);
    try {
      const command = parseGenerateDocumentCommand(await readJson(req));
      const result = await deps.generationService.generate(command);
      const response = {
        jobId: result.jobId || randomUUID(),
        status: result.status,
        templateId: result.templateId,
        templateVersion: result.templateVersion,
        output: { format: result.format, fileName: result.fileName, contentType: result.contentType, pageCount: result.pageCount, warnings: result.warnings ?? [] },
        file: { encoding:'base64', content: Buffer.from(result.bytes).toString('base64') },
      };
      return sendJson(res, 200, response);
    } catch (error) {
      if (error instanceof GenerationServiceUnavailableError) return sendJson(res, 503, { error:{ code:error.code, message:error.message } } satisfies ApiError);
      const code = typeof error === 'object' && error && 'code' in error ? String((error as {code:unknown}).code) : 'GENERATION_FAILED';
      const message = error instanceof Error ? error.message : 'Document generation failed.';
      const status = code === 'PAYLOAD_TOO_LARGE' ? 413 : code === 'INVALID_JSON' || code === 'INVALID_REQUEST' ? 400 : 500;
      return sendJson(res, status, { error:{ code, message } } satisfies ApiError);
    }
  };
}
