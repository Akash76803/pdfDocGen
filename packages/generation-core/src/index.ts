import type { DocumentGroup, NormalizedRecord, NormalizedValue, TemplateDefinition } from '@document-tool/contracts';
import { TemplateEngine } from '@document-tool/template-engine';
import { CombinedPdfRenderer, PdfRenderer } from '@document-tool/renderer-pdf';
import { buildHeadlessEditableDocx } from './headless-editable-docx.js';
import { applyDesktopFormulaFields } from './desktop-formulas.js';
import { applyDesktopResolvedDocumentParity } from './desktop-parity.js';

export type DocumentOutputFormat = 'pdf' | 'docx-exact' | 'docx-editable';
export type DocumentResponseMode = 'binary' | 'base64';
export type DocumentBatchOutputMode = 'separate' | 'combined';
export type DocumentBatchPageNumbering = 'per-document' | 'global';

export type GenerateDocumentCommand = {
  templateId: string;
  templateVersion?: number;
  output: { format: DocumentOutputFormat; fileName?: string; renderMode?: 'native-auto' | 'exact'; responseMode?: DocumentResponseMode };
  data: Record<string, unknown>;
};

export type GenerateDocumentBatchItem = {
  id?: string;
  fileName?: string;
  data: Record<string, unknown>;
};

export type GenerateDocumentBatchCommand = {
  templateId: string;
  templateVersion?: number;
  output: {
    format: DocumentOutputFormat;
    outputMode: DocumentBatchOutputMode;
    fileName?: string;
    renderMode?: 'native-auto' | 'exact';
    responseMode?: DocumentResponseMode;
    pageNumbering?: DocumentBatchPageNumbering;
  };
  documents: GenerateDocumentBatchItem[];
};

export type GeneratedDocument = {
  jobId: string;
  status: 'completed';
  templateId: string;
  templateVersion?: number;
  format: DocumentOutputFormat;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
  pageCount?: number;
  warnings?: string[];
};

export type GeneratedBatchDocumentResult = {
  id: string;
  fileName: string;
  contentType: string;
  pageCount?: number;
  startPage?: number;
  endPage?: number;
  warnings?: string[];
};

export type GeneratedDocumentBatch = {
  jobId: string;
  status: 'completed';
  templateId: string;
  templateVersion?: number;
  format: DocumentOutputFormat;
  outputMode: DocumentBatchOutputMode;
  documentCount: number;
  totalPageCount?: number;
  documents: GeneratedBatchDocumentResult[];
  files?: GeneratedDocument[];
  combined?: GeneratedDocument;
  warnings?: string[];
};

export interface DocumentGenerationService {
  generate(command: GenerateDocumentCommand): Promise<GeneratedDocument>;
  generateBatch?(command: GenerateDocumentBatchCommand): Promise<GeneratedDocumentBatch>;
}

export interface TemplateRepository {
  getTemplate(templateId: string, templateVersion?: number): Promise<TemplateDefinition | null>;
}

export class GenerationError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) { super(message); }
}

export class GenerationServiceUnavailableError extends GenerationError {
  constructor(message = 'No document generation adapter is configured.') { super('GENERATION_SERVICE_UNAVAILABLE', message); }
}

export class TemplateNotFoundError extends GenerationError {
  constructor(templateId: string, templateVersion?: number) {
    super('TEMPLATE_NOT_FOUND', templateVersion === undefined
      ? `Template "${templateId}" was not found.`
      : `Template "${templateId}" version ${templateVersion} was not found.`,
    { templateId, templateVersion });
  }
}

export class UnsupportedOutputFormatError extends GenerationError {
  constructor(format: DocumentOutputFormat) {
    super('UNSUPPORTED_OUTPUT_FORMAT', `Headless generation for output format "${format}" is not available.`, { format });
  }
}

export class ExactDocxUnavailableError extends GenerationError {
  constructor() {
    super('EXACT_DOCX_UNAVAILABLE', 'DOCX Exact requires the browser materialized-preview/raster pipeline and is not available in the headless API. Use output.format "docx-editable".');
  }
}

export class ExactRenderUnavailableError extends GenerationError {
  constructor() {
    super('EXACT_RENDER_UNAVAILABLE', 'Exact PDF rendering requires the browser materialized-preview pipeline and is not available in the headless API. Use renderMode "native-auto" or omit renderMode.');
  }
}

export class TemplateRenderFailedError extends GenerationError {
  constructor(message: string, details?: unknown) { super('TEMPLATE_RENDER_FAILED', message, details); }
}

export class UnconfiguredDocumentGenerationService implements DocumentGenerationService {
  async generate(_command: GenerateDocumentCommand): Promise<GeneratedDocument> {
    throw new GenerationServiceUnavailableError();
  }
}

export function contentTypeForFormat(format: DocumentOutputFormat): string {
  if (format === 'pdf') return 'application/pdf';
  return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

function safeFileStem(value: string | undefined, templateId: string): string {
  const raw = (value ?? templateId).trim().replace(/\.(pdf|docx)$/i, '');
  const cleaned = raw.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned || 'document';
}

function toNormalizedValue(value: unknown): NormalizedValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(toNormalizedValue);
  if (value && typeof value === 'object') return toNormalizedRecord(value as Record<string, unknown>);
  return value === undefined ? null : String(value);
}

function toNormalizedRecord(value: Record<string, unknown>): NormalizedRecord {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toNormalizedValue(item)]));
}

function rawDataToDocumentGroup(data: Record<string, unknown>): DocumentGroup {
  const normalizedRoot = toNormalizedRecord(data);
  const itemArray = Array.isArray(data.items) ? data.items : [];
  const sourceItemArray = Array.isArray(data.sourceItems) ? data.sourceItems : itemArray;
  const items = itemArray.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)).map(toNormalizedRecord);
  const sourceItems = sourceItemArray.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)).map(toNormalizedRecord);
  const detailArray = Array.isArray(data.itemDetails) ? data.itemDetails : [];
  const itemDetails = detailArray
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item, index) => ({ data: toNormalizedRecord((item.data && typeof item.data === 'object' && !Array.isArray(item.data) ? item.data : item) as Record<string, unknown>), sourceRowIndex: typeof item.sourceRowIndex === 'number' ? item.sourceRowIndex : index }));
  const keyCandidate = data.documentKey ?? data.id ?? data.invoiceNo ?? data.invoiceNumber ?? 'api-document';
  return {
    id: String(data.id ?? keyCandidate),
    key: String(keyCandidate),
    header: normalizedRoot,
    items,
    sourceItems,
    itemDetails,
    sourceRowIndexes: items.map((_, index) => index),
    warnings: [],
    valid: true,
  };
}

function batchDocumentId(document: GenerateDocumentBatchItem, index: number): string {
  const explicit = document.id?.trim();
  if (explicit) return explicit;
  const data = document.data;
  const candidate = data.documentKey ?? data.id ?? data.invoiceNo ?? data.invoiceNumber;
  return candidate === undefined || candidate === null || String(candidate).trim() === ''
    ? `document-${index + 1}`
    : String(candidate);
}

function uniqueBatchDocumentId(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}#${suffix}`)) suffix++;
  const value = `${base}#${suffix}`;
  used.add(value);
  return value;
}

export class HeadlessDocumentGenerationService implements DocumentGenerationService {
  constructor(
    private readonly templates: TemplateRepository,
    private readonly templateEngine = new TemplateEngine(),
    private readonly pdfRenderer = new PdfRenderer(),
    private readonly combinedPdfRenderer = new CombinedPdfRenderer(),
  ) {}

  async generateBatch(command: GenerateDocumentBatchCommand): Promise<GeneratedDocumentBatch> {
    if (!command.documents.length) {
      throw new GenerationError('EMPTY_BATCH', 'Batch generation requires at least one document.');
    }

    if (command.output.outputMode === 'separate') {
      const files: GeneratedDocument[] = [];
      const documents: GeneratedBatchDocumentResult[] = [];
      for (let index = 0; index < command.documents.length; index++) {
        const document = command.documents[index]!;
        const id = batchDocumentId(document, index);
        const generated = await this.generate({
          templateId: command.templateId,
          templateVersion: command.templateVersion,
          output: {
            format: command.output.format,
            fileName: document.fileName ?? id,
            renderMode: command.output.renderMode,
          },
          data: document.data,
        });
        files.push(generated);
        documents.push({
          id,
          fileName: generated.fileName,
          contentType: generated.contentType,
          pageCount: generated.pageCount,
          warnings: generated.warnings,
        });
      }
      return {
        jobId: '',
        status: 'completed',
        templateId: command.templateId,
        templateVersion: files[0]?.templateVersion,
        format: command.output.format,
        outputMode: 'separate',
        documentCount: files.length,
        totalPageCount: files.reduce((sum, file) => sum + (file.pageCount ?? 0), 0) || undefined,
        documents,
        files,
        warnings: files.flatMap((file) => file.warnings ?? []),
      };
    }

    if (command.output.format !== 'pdf') {
      throw new UnsupportedOutputFormatError(command.output.format);
    }
    if (command.output.renderMode === 'exact') {
      throw new ExactRenderUnavailableError();
    }

    const template = await this.templates.getTemplate(command.templateId, command.templateVersion);
    if (!template) throw new TemplateNotFoundError(command.templateId, command.templateVersion);
    if (command.templateVersion !== undefined && template.version !== command.templateVersion) {
      throw new TemplateNotFoundError(command.templateId, command.templateVersion);
    }

    const usedIds = new Set<string>();
    const sources = command.documents.map((document, index) => {
      const id = uniqueBatchDocumentId(batchDocumentId(document, index), usedIds);
      return {
        documentGroupId: id,
        label: id,
        resolve: async () => {
          const normalizedGroup = rawDataToDocumentGroup(document.data);
          const parityGroup = applyDesktopResolvedDocumentParity(template, normalizedGroup);
          const group = applyDesktopFormulaFields(template, parityGroup);
          const rendered = this.templateEngine.buildRenderModel(template, group);
          if (!rendered.model || rendered.errors.length) {
            throw new TemplateRenderFailedError('Template could not be rendered with the supplied batch document data.', {
              documentId: id,
              documentIndex: index,
              errors: rendered.errors,
              warnings: rendered.warnings,
            });
          }
          return { template, model: rendered.model };
        },
      };
    });

    try {
      const output = await this.combinedPdfRenderer.render(sources, {
        fileNamePrefix: safeFileStem(command.output.fileName, command.templateId),
        pageNumbering: command.output.pageNumbering === 'global' ? 'GLOBAL' : 'PER_DOCUMENT',
        totalDocumentsHint: command.documents.length,
      });
      const combined: GeneratedDocument = {
        jobId: '',
        status: 'completed',
        templateId: command.templateId,
        templateVersion: template.version,
        format: 'pdf',
        fileName: output.fileName,
        contentType: output.mimeType,
        bytes: output.content,
        pageCount: output.totalPages,
        warnings: output.warnings,
      };
      return {
        jobId: '',
        status: 'completed',
        templateId: command.templateId,
        templateVersion: template.version,
        format: 'pdf',
        outputMode: 'combined',
        documentCount: output.documentCount,
        totalPageCount: output.totalPages,
        documents: output.documents.map((document) => ({
          id: document.documentGroupId,
          fileName: combined.fileName,
          contentType: combined.contentType,
          pageCount: document.pageCount,
          startPage: document.startPage,
          endPage: document.endPage,
          warnings: document.warnings,
        })),
        combined,
        warnings: output.warnings,
      };
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      throw new TemplateRenderFailedError(error instanceof Error ? error.message : 'Combined PDF renderer failed.');
    }
  }

  async generate(command: GenerateDocumentCommand): Promise<GeneratedDocument> {
    if (command.output.format === 'docx-exact') throw new ExactDocxUnavailableError();
    if (command.output.format === 'pdf' && command.output.renderMode === 'exact') throw new ExactRenderUnavailableError();
    if (command.output.format !== 'pdf' && command.output.format !== 'docx-editable') throw new UnsupportedOutputFormatError(command.output.format);

    const template = await this.templates.getTemplate(command.templateId, command.templateVersion);
    if (!template) throw new TemplateNotFoundError(command.templateId, command.templateVersion);
    if (command.templateVersion !== undefined && template.version !== command.templateVersion) {
      throw new TemplateNotFoundError(command.templateId, command.templateVersion);
    }

    const normalizedGroup = rawDataToDocumentGroup(command.data);
    const parityGroup = applyDesktopResolvedDocumentParity(template, normalizedGroup);
    const group = applyDesktopFormulaFields(template, parityGroup);
    const rendered = this.templateEngine.buildRenderModel(template, group);
    if (!rendered.model || rendered.errors.length) {
      throw new TemplateRenderFailedError('Template could not be rendered with the supplied data.', { errors: rendered.errors, warnings: rendered.warnings });
    }

    const fileStem = safeFileStem(command.output.fileName, command.templateId);
    const warnings = rendered.warnings.map((warning) => warning.message);

    try {
      if (command.output.format === 'docx-editable') {
        const output = buildHeadlessEditableDocx(template, rendered.model);
        return {
          jobId: '',
          status: 'completed',
          templateId: command.templateId,
          templateVersion: template.version,
          format: 'docx-editable',
          fileName: `${fileStem}.docx`,
          contentType: contentTypeForFormat('docx-editable'),
          bytes: output.bytes,
          pageCount: output.pageCount,
          warnings: [...warnings, ...output.warnings],
        };
      }

      let pageCount: number | undefined;
      const output = await this.pdfRenderer.render(template, rendered.model, {
        fileNamePrefix: fileStem,
        options: { onDiagnostics: (diagnostics: { pageCount: number }) => { pageCount = diagnostics.pageCount; } },
      });
      return {
        jobId: '',
        status: 'completed',
        templateId: command.templateId,
        templateVersion: template.version,
        format: 'pdf',
        fileName: output.fileName,
        contentType: output.mimeType,
        bytes: output.content,
        pageCount,
        warnings,
      };
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      throw new TemplateRenderFailedError(error instanceof Error ? error.message : `${command.output.format.toUpperCase()} renderer failed.`);
    }
  }
}

/** @deprecated Kept for DB-6B source compatibility. Use HeadlessDocumentGenerationService. */
export class NativePdfDocumentGenerationService extends HeadlessDocumentGenerationService {}

export { buildHeadlessEditableDocx } from './headless-editable-docx.js';
export { applyDesktopResolvedDocumentParity } from './desktop-parity.js';
