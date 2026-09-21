import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import {
  TEMPLATE_PUBLICATION_FORMAT,
  type PublishTemplateRequest,
  type PublishTemplateResponse,
  type PublishedTemplateRecord,
  type TemplateDefinition,
} from '@document-tool/contracts';
import type { TemplateRepository } from '@document-tool/generation-core';
import { adaptDesktopTemplateEntry, isDesktopTemplateEntry } from './desktop-template-adapter.js';

const SAFE_TEMPLATE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function isTemplateDefinition(value: unknown, templateId: string): value is TemplateDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<TemplateDefinition>;
  return candidate.id === templateId && typeof candidate.name === 'string' && typeof candidate.version === 'number' && !!candidate.page && !!candidate.header && !!candidate.body && !!candidate.footer;
}

function isPublishedTemplateRecord(value: unknown, templateId: string): value is PublishedTemplateRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PublishedTemplateRecord>;
  return candidate.format === TEMPLATE_PUBLICATION_FORMAT
    && candidate.templateId === templateId
    && typeof candidate.name === 'string'
    && Number.isInteger(candidate.version)
    && typeof candidate.publishedAt === 'string'
    && typeof candidate.updatedAt === 'string'
    && (candidate.status === 'DRAFT' || candidate.status === 'ACTIVE' || candidate.status === 'ARCHIVED')
    && Boolean(candidate.metadata && typeof candidate.metadata === 'object')
    && Boolean(candidate.template && typeof candidate.template === 'object');
}

export interface TemplatePublishRepository {
  publishTemplate(request: PublishTemplateRequest): Promise<PublishTemplateResponse>;
}

export class FileSystemTemplateRepository implements TemplateRepository {
  readonly rootDirectory: string;

  constructor(rootDirectory: string) {
    this.rootDirectory = resolve(rootDirectory);
  }

  private resolveTemplatePath(templateId: string, version?: number) {
    if (!SAFE_TEMPLATE_ID.test(templateId) || templateId.includes('..')) return null;
    const suffix = version === undefined ? '' : `.v${version}`;
    const candidate = resolve(this.rootDirectory, `${templateId}${suffix}.json`);
    if (candidate !== this.rootDirectory && !candidate.startsWith(`${this.rootDirectory}${sep}`)) return null;
    return candidate;
  }

  async saveDesktopTemplateEntry(value: unknown): Promise<string> {
    if (!isDesktopTemplateEntry(value) || !SAFE_TEMPLATE_ID.test(value.id) || value.id.includes('..')) {
      throw Object.assign(new Error('Template payload must be a valid desktop TemplateLibraryEntry.'), { code: 'INVALID_TEMPLATE_PAYLOAD' });
    }
    const filePath = this.resolveTemplatePath(value.id);
    if (!filePath) throw Object.assign(new Error('Template ID is invalid.'), { code: 'INVALID_TEMPLATE_ID' });
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    return filePath;
  }

  async publishTemplate(request: PublishTemplateRequest): Promise<PublishTemplateResponse> {
    if (!SAFE_TEMPLATE_ID.test(request.templateId) || request.templateId.includes('..')) {
      throw Object.assign(new Error('Template ID is invalid.'), { code: 'INVALID_TEMPLATE_ID' });
    }
    if (!isDesktopTemplateEntry(request.template) || request.template.id !== request.templateId) {
      throw Object.assign(new Error('Published template content must be a valid matching desktop template entry.'), { code: 'INVALID_TEMPLATE_PAYLOAD' });
    }

    const currentPath = this.resolveTemplatePath(request.templateId);
    const versionPath = this.resolveTemplatePath(request.templateId, request.version);
    if (!currentPath || !versionPath) throw Object.assign(new Error('Template ID is invalid.'), { code: 'INVALID_TEMPLATE_ID' });

    let current: PublishedTemplateRecord | null = null;
    try {
      const parsed: unknown = JSON.parse(await readFile(currentPath, 'utf8'));
      if (isPublishedTemplateRecord(parsed, request.templateId)) current = parsed;
      // A legacy local-mirror file is not a cloud publication. The first
      // explicit publish promotes it into a versioned publication record.
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (code !== 'ENOENT') throw error;
    }

    if (current) {
      if (request.expectedVersion === undefined || request.expectedVersion !== current.version) {
        throw Object.assign(new Error(`Template version conflict. Current cloud version is ${current.version}.`), {
          code: 'TEMPLATE_VERSION_CONFLICT',
          details: { templateId: request.templateId, expectedVersion: request.expectedVersion, currentVersion: current.version },
        });
      }
      if (request.version !== current.version + 1) {
        throw Object.assign(new Error(`Updated template version must be ${current.version + 1}.`), {
          code: 'INVALID_TEMPLATE_VERSION',
          details: { templateId: request.templateId, requestedVersion: request.version, requiredVersion: current.version + 1 },
        });
      }
    } else if (request.expectedVersion !== undefined && request.expectedVersion !== 0) {
      throw Object.assign(new Error('Template does not exist in the publish repository.'), {
        code: 'TEMPLATE_VERSION_CONFLICT',
        details: { templateId: request.templateId, expectedVersion: request.expectedVersion, currentVersion: null },
      });
    }

    const now = new Date().toISOString();
    const record: PublishedTemplateRecord = {
      format: TEMPLATE_PUBLICATION_FORMAT,
      templateId: request.templateId,
      name: request.name,
      version: request.version,
      status: request.status,
      metadata: request.metadata,
      publishedAt: current?.publishedAt ?? now,
      updatedAt: now,
      template: request.template,
    };
    await mkdir(dirname(currentPath), { recursive: true });
    const serialized = `${JSON.stringify(record, null, 2)}\n`;
    await writeFile(versionPath, serialized, { encoding: 'utf8', flag: 'wx' }).catch((error: unknown) => {
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (code === 'EEXIST') throw Object.assign(new Error(`Template version ${request.version} already exists.`), { code: 'TEMPLATE_VERSION_CONFLICT' });
      throw error;
    });
    await writeFile(currentPath, serialized, 'utf8');
    return {
      status: current ? 'updated' : 'published',
      templateId: request.templateId,
      version: request.version,
      publicationStatus: request.status,
      publishedAt: record.publishedAt,
    };
  }

  async deleteTemplateFile(templateId: string): Promise<void> {
    const filePath = this.resolveTemplatePath(templateId);
    if (!filePath) throw Object.assign(new Error('Template ID is invalid.'), { code: 'INVALID_TEMPLATE_ID' });
    try { await unlink(filePath); } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (code !== 'ENOENT') throw error;
    }
  }

  async getTemplate(templateId: string, templateVersion?: number): Promise<TemplateDefinition | null> {
    const requested = this.resolveTemplatePath(templateId, templateVersion);
    if (!requested) return null;
    const candidates = templateVersion === undefined
      ? [requested]
      : [requested, this.resolveTemplatePath(templateId) as string];

    for (const filePath of candidates) {
      try {
        const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
        const record = isPublishedTemplateRecord(parsed, templateId) ? parsed : null;
        if (record && record.status !== 'ACTIVE') continue;
        const source = record?.template ?? parsed;
        const definition = isTemplateDefinition(source, templateId)
          ? source
          : isDesktopTemplateEntry(source) && source.id === templateId
            ? adaptDesktopTemplateEntry(source)
            : null;
        if (!definition) continue;
        const version = record?.version ?? definition.version;
        if (templateVersion !== undefined && version !== templateVersion) continue;
        return { ...definition, version };
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
        if (code === 'ENOENT') continue;
        if (error instanceof SyntaxError) throw new Error(`Template file for "${templateId}" contains invalid JSON.`);
        throw error;
      }
    }
    return null;
  }
}

export class CompositeTemplateRepository implements TemplateRepository {
  readonly repositories: readonly TemplateRepository[];

  constructor(repositories: readonly TemplateRepository[]) {
    this.repositories = repositories;
  }

  async getTemplate(templateId: string, templateVersion?: number): Promise<TemplateDefinition | null> {
    for (const repository of this.repositories) {
      const found = await repository.getTemplate(templateId, templateVersion);
      if (found) return found;
    }
    return null;
  }
}
