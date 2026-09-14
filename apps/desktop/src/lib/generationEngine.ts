import type { NormalizedRecord } from '@document-tool/contracts';
import { displayValue, valueForField, type BuilderDataSource } from './dataSourceStore.ts';
import type { PdfRenderProfileId } from './pdfRenderProfile.ts';
import type { NativePdfMode } from './nativePdfGeneration.ts';

export const TEMPLATE_STORAGE_KEY = 'document-builder.template.db2.v1';
export const GENERATION_REQUEST_KEY = 'document-builder.generation.request.db5b.v1';
export const GENERATION_HISTORY_KEY = 'document-builder.generation.history.db5b.v1';
export const GENERATION_REQUEST_EVENT = 'document-builder:generation-request';
export const GENERATION_HISTORY_EVENT = 'document-builder:generation-history';
export const BULK_GENERATION_EVENT = 'document-builder:bulk-generation';
export const GENERATION_PROGRESS_EVENT = 'document-builder:generation-progress';
export const GENERATION_PROGRESS_KEY = 'document-builder.generation.progress.db5cfix3.v1';

export type GenerationFormat = 'pdf' | 'docx-exact' | 'docx-editable';

export type GenerationRequest = {
  id: string;
  templateName: string;
  sourceId: string;
  activeRecordIndex: number;
  documentLabel: string;
  format: GenerationFormat;
  fileName: string;
  pdfRenderProfile?: PdfRenderProfileId;
  pdfRenderMode?: NativePdfMode;
  createdAt: string;
  combinedPdf?: {
    batchId: string;
    index: number;
    total: number;
    finalFileName: string;
  };
};

export type GenerationHistoryEntry = GenerationRequest & {
  status: 'success' | 'failed';
  completedAt: string;
  error?: string;
};

type MinimalElement = {
  type?: string;
  table?: {
    mode?: string;
    binding?: { sourceId?: string; parentKey?: string; parentKeys?: string[] };
  };
};

type MinimalTemplate = {
  name?: string;
  updatedAt?: string;
  pages?: Array<{ elements?: MinimalElement[] }>;
  elements?: MinimalElement[];
};

export type SavedTemplateSummary = {
  name: string;
  updatedAt?: string;
  sourceIds: string[];
  parentKeysBySource: Record<string, string[]>;
};

export function readSavedTemplateSummary(storage: Pick<Storage, 'getItem'>): SavedTemplateSummary | null {
  const raw = storage.getItem(TEMPLATE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as MinimalTemplate;
    const elements = Array.isArray(saved.pages)
      ? saved.pages.flatMap((page) => page.elements ?? [])
      : saved.elements ?? [];
    const parentKeysBySource: Record<string, string[]> = {};
    const sourceIds = new Set<string>();
    for (const element of elements) {
      const binding = element.table?.binding;
      if (!binding?.sourceId) continue;
      sourceIds.add(binding.sourceId);
      const keys = (binding.parentKeys?.filter(Boolean) ?? (binding.parentKey ? [binding.parentKey] : []));
      if (keys.length && !parentKeysBySource[binding.sourceId]) parentKeysBySource[binding.sourceId] = keys;
    }
    return {
      name: saved.name?.trim() || 'Untitled Document',
      updatedAt: saved.updatedAt,
      sourceIds: Array.from(sourceIds),
      parentKeysBySource,
    };
  } catch {
    return null;
  }
}

export function buildDocumentOptions(source: BuilderDataSource, parentKeys: string[]): Array<{ value: number; label: string; rawLabel: string }> {
  if (parentKeys.length === 0) {
    return source.records.map((_record, index) => ({ value: index, label: `Record #${index + 1}`, rawLabel: `Record-${index + 1}` }));
  }
  const seen = new Set<string>();
  const fieldLabels = parentKeys.map((key) => source.fields.find((field) => field.name === key)?.label || key);
  const options: Array<{ value: number; label: string; rawLabel: string }> = [];
  source.records.forEach((record, index) => {
    const values = parentKeys.map((key) => displayValue(valueForField(record, key)).trim());
    const composite = values.join('\u241F');
    if (!composite || values.every((value) => !value) || seen.has(composite)) return;
    seen.add(composite);
    options.push({
      value: index,
      label: parentKeys.length === 1 ? `${fieldLabels[0]}: ${values[0]}` : `${fieldLabels.join(' + ')}: ${values.join(' · ')}`,
      rawLabel: values.filter(Boolean).join('_') || `Record-${index + 1}`,
    });
  });
  return options;
}

export function resolveFileNamePattern(pattern: string, record: NormalizedRecord | null, templateName: string, documentLabel: string): string {
  const resolved = pattern.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, rawField: string) => {
    const field = rawField.trim();
    if (/^template(name)?$/i.test(field)) return templateName;
    if (/^(document|documentid|record)$/i.test(field)) return documentLabel;
    return displayValue(valueForField(record, field));
  });
  return sanitizeGeneratedFileName(resolved || `${templateName}_${documentLabel}`);
}

export function sanitizeGeneratedFileName(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return (cleaned || 'Document').slice(0, 180);
}

export function validateGeneration(input: {
  template: SavedTemplateSummary | null;
  source: BuilderDataSource | null;
  record: NormalizedRecord | null;
  format?: GenerationFormat;
  fileName: string;
}): string[] {
  const errors: string[] = [];
  if (!input.template) errors.push('Save a template before generating a document.');
  if (!input.source) errors.push('Select an imported data source.');
  if (!input.record) errors.push('Select a document / record to generate.');
  if (!input.format) errors.push('Select an output format.');
  if (!input.fileName.trim()) errors.push('File name cannot be empty.');
  if (input.template && input.source && input.template.sourceIds.length > 0 && !input.template.sourceIds.includes(input.source.id)) {
    errors.push('Selected data source is not used by the saved template.');
  }
  return errors;
}

export function readGenerationRequest(storage: Pick<Storage, 'getItem'>): GenerationRequest | null {
  try {
    const raw = storage.getItem(GENERATION_REQUEST_KEY);
    return raw ? JSON.parse(raw) as GenerationRequest : null;
  } catch { return null; }
}

export function writeGenerationRequest(storage: Pick<Storage, 'setItem'>, request: GenerationRequest) {
  storage.setItem(GENERATION_REQUEST_KEY, JSON.stringify(request));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(GENERATION_REQUEST_EVENT, { detail: request.id }));
}

export function clearGenerationRequest(storage: Pick<Storage, 'removeItem'>) {
  storage.removeItem(GENERATION_REQUEST_KEY);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(GENERATION_REQUEST_EVENT, { detail: null }));
}

export function readGenerationHistory(storage: Pick<Storage, 'getItem'>): GenerationHistoryEntry[] {
  try {
    const raw = storage.getItem(GENERATION_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 50) as GenerationHistoryEntry[] : [];
  } catch { return []; }
}

export function appendGenerationHistory(storage: Pick<Storage, 'getItem' | 'setItem'>, entry: GenerationHistoryEntry) {
  const current = readGenerationHistory(storage);
  storage.setItem(GENERATION_HISTORY_KEY, JSON.stringify([entry, ...current.filter((item) => item.id !== entry.id)].slice(0, 50)));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(GENERATION_HISTORY_EVENT, { detail: entry.id }));
}

export type GenerationProgressSnapshot = {
  requestId: string;
  percent: number;
  current?: number;
  total?: number;
  message: string;
  updatedAt: string;
};

export function readGenerationProgress(storage: Pick<Storage, 'getItem'>): GenerationProgressSnapshot | null {
  try {
    const raw = storage.getItem(GENERATION_PROGRESS_KEY);
    return raw ? JSON.parse(raw) as GenerationProgressSnapshot : null;
  } catch { return null; }
}

export function writeGenerationProgress(storage: Pick<Storage, 'setItem'>, progress: Omit<GenerationProgressSnapshot, 'updatedAt'>) {
  const next: GenerationProgressSnapshot = { ...progress, percent: Math.max(0, Math.min(100, progress.percent)), updatedAt: new Date().toISOString() };
  storage.setItem(GENERATION_PROGRESS_KEY, JSON.stringify(next));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(GENERATION_PROGRESS_EVENT, { detail: next }));
}

export function clearGenerationProgress(storage: Pick<Storage, 'removeItem'>) {
  storage.removeItem(GENERATION_PROGRESS_KEY);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(GENERATION_PROGRESS_EVENT));
}

export const BULK_GENERATION_KEY = 'document-builder.generation.bulk.db5c.v1';
export type BulkGenerationState = {
  id: string;
  sourceId: string;
  format: GenerationFormat;
  filePattern: string;
  requests: GenerationRequest[];
  completedIds: string[];
  failedIds: string[];
  status: 'running' | 'complete' | 'paused';
  outputMode?: 'separate' | 'combined-pdf';
  renderMode?: NativePdfMode;
  combinedFileName?: string;
  createdAt: string;
};
export function readBulkGeneration(storage: Pick<Storage,'getItem'>): BulkGenerationState | null {
  try { const raw=storage.getItem(BULK_GENERATION_KEY); return raw ? JSON.parse(raw) as BulkGenerationState : null; } catch { return null; }
}
export function writeBulkGeneration(storage: Pick<Storage,'setItem'>, state: BulkGenerationState) {
  storage.setItem(BULK_GENERATION_KEY, JSON.stringify(state));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(BULK_GENERATION_EVENT, { detail: state.id }));
}
export function clearBulkGeneration(storage: Pick<Storage,'removeItem'>) { storage.removeItem(BULK_GENERATION_KEY); }
