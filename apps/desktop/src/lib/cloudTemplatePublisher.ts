import type { PublishTemplateRequest, PublishTemplateResponse } from '@document-tool/contracts';
import { selfContainedTemplateEntry } from './templateFileStore.ts';
import type { TemplateLibraryEntry } from './templateLibrary.ts';

export const CLOUD_API_BASE_URL_KEY = 'document-builder.cloud-api-base-url.v1';

export class TemplatePublishError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) { super(message); }
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  if (!normalized) throw new TemplatePublishError('CLOUD_API_NOT_CONFIGURED', 'Configure the hosted Document API URL in Settings before publishing.');
  let url: URL;
  try { url = new URL(normalized); } catch { throw new TemplatePublishError('INVALID_CLOUD_API_URL', 'The hosted Document API URL is invalid.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new TemplatePublishError('INVALID_CLOUD_API_URL', 'The hosted Document API URL must use HTTP or HTTPS.');
  return normalized;
}

export function resolveCloudApiBaseUrl(storage: Storage): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return normalizeBaseUrl(storage.getItem(CLOUD_API_BASE_URL_KEY) ?? env?.VITE_CLOUD_API_BASE_URL ?? '');
}

export function saveCloudApiBaseUrl(storage: Storage, value: string): string {
  const normalized = normalizeBaseUrl(value);
  storage.setItem(CLOUD_API_BASE_URL_KEY, normalized);
  return normalized;
}

async function readError(response: Response): Promise<TemplatePublishError> {
  try {
    const body = await response.json() as { error?: { code?: string; message?: string; details?: unknown } };
    if (body.error) return new TemplatePublishError(body.error.code ?? 'TEMPLATE_PUBLISH_FAILED', body.error.message ?? `Template publish failed (${response.status}).`, body.error.details);
  } catch { /* use the HTTP fallback */ }
  return new TemplatePublishError('TEMPLATE_PUBLISH_FAILED', `Template publish failed (${response.status} ${response.statusText}).`);
}

export async function publishTemplateToCloud(
  storage: Storage,
  entry: TemplateLibraryEntry,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishTemplateResponse & { apiBaseUrl: string }> {
  if (!entry.id.trim() || !entry.name.trim()) throw new TemplatePublishError('INVALID_TEMPLATE', 'Template ID and name are required before publishing.');
  const apiBaseUrl = resolveCloudApiBaseUrl(storage);
  const template = await selfContainedTemplateEntry(entry);
  const expectedVersion = entry.cloudPublication?.version;
  const version = expectedVersion === undefined ? Math.max(1, entry.version ?? 1) : expectedVersion + 1;
  const request: PublishTemplateRequest = {
    templateId: entry.id,
    name: entry.name,
    version,
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
    status: 'ACTIVE',
    metadata: {
      source: 'desktop-document-builder',
      documentType: entry.documentType,
      category: entry.category ?? 'General',
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    },
    template,
  };
  let response: Response;
  try {
    response = await fetchImpl(`${apiBaseUrl}/api/v1/templates/${encodeURIComponent(entry.id)}/publish`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch (error) {
    throw new TemplatePublishError('CLOUD_API_UNREACHABLE', error instanceof Error ? `Unable to reach the hosted Document API: ${error.message}` : 'Unable to reach the hosted Document API.');
  }
  if (!response.ok) throw await readError(response);
  const result = await response.json() as PublishTemplateResponse;
  if ((result.status !== 'published' && result.status !== 'updated') || result.templateId !== entry.id || !Number.isInteger(result.version)) {
    throw new TemplatePublishError('INVALID_PUBLISH_RESPONSE', 'The hosted Document API returned an invalid publish response.');
  }
  return { ...result, apiBaseUrl };
}
