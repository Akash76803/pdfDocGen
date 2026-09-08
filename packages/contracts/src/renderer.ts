import type { PageDefinition, RenderBlock, TemplateDefinition } from './template.js';

export type DocumentFormat = 'PDF' | 'DOCX' | 'XLSX' | 'CSV' | 'PNG' | 'HTML';

export interface RenderModel {
  /** Legacy variables remain for renderer compatibility. */
  variables: Record<string, unknown>;
  page?: PageDefinition;
  header?: RenderBlock[];
  body?: RenderBlock[];
  footer?: RenderBlock[];
  metadata?: Record<string, unknown>;
}
export interface GeneratedDocument { format:DocumentFormat;content:Uint8Array;fileName:string;mimeType:string; }
export interface GenerationRequest { templateId:string;template?:TemplateDefinition;records:Record<string,unknown>[];outputFormat:DocumentFormat;outputDirectory?:string; }
export interface GenerationResult { success:boolean;documents:GeneratedDocument[];error?:string;elapsedMs:number; }
