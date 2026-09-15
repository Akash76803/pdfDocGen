export type DocumentOutputFormat = 'pdf' | 'docx-exact' | 'docx-editable';

export type GenerateDocumentCommand = {
  templateId: string;
  templateVersion?: number;
  output: { format: DocumentOutputFormat; fileName?: string; renderMode?: 'native-auto' | 'exact' };
  data: Record<string, unknown>;
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

export interface DocumentGenerationService {
  generate(command: GenerateDocumentCommand): Promise<GeneratedDocument>;
}

export class GenerationServiceUnavailableError extends Error {
  readonly code = 'GENERATION_SERVICE_UNAVAILABLE';
  constructor(message = 'No document generation adapter is configured.') { super(message); }
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
