import { TemplateDefinition, RenderModel, GeneratedDocument, DocumentFormat } from '@document-tool/contracts';

export interface RenderOptions {
  fileNamePrefix?: string;
  outputPath?: string;
  options?: Record<string, any>;
}

/** @deprecated Low-level renderer contract retained for existing renderers. */
export interface LegacyDocumentRenderer {
  readonly format: DocumentFormat;

  render(
    template: TemplateDefinition,
    model: RenderModel,
    options?: RenderOptions
  ): Promise<GeneratedDocument>;
}
