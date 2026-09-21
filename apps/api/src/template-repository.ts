import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { TemplateDefinition } from '@document-tool/contracts';
import type { TemplateRepository } from '@document-tool/generation-core';
import { adaptDesktopTemplateEntry, isDesktopTemplateEntry } from './desktop-template-adapter.js';

const SAFE_TEMPLATE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function isTemplateDefinition(value: unknown, templateId: string): value is TemplateDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<TemplateDefinition>;
  return candidate.id === templateId && typeof candidate.name === 'string' && typeof candidate.version === 'number' && !!candidate.page && !!candidate.header && !!candidate.body && !!candidate.footer;
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
        const definition = isTemplateDefinition(parsed, templateId)
          ? parsed
          : isDesktopTemplateEntry(parsed) && parsed.id === templateId
            ? adaptDesktopTemplateEntry(parsed)
            : null;
        if (!definition) continue;
        if (templateVersion !== undefined && definition.version !== templateVersion) continue;
        return definition;
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
