import { LegacyDocumentRenderer, RenderOptions } from '@document-tool/renderer-sdk';
import { TemplateDefinition, RenderModel, GeneratedDocument, DocumentFormat } from '@document-tool/contracts';

export class DocxRenderer implements LegacyDocumentRenderer {
  readonly format: DocumentFormat = 'DOCX';

  async render(
    template: TemplateDefinition,
    model: RenderModel,
    options?: RenderOptions
  ): Promise<GeneratedDocument> {
    const encoder = new TextEncoder();
    const mockContent = encoder.encode(
      `[MS-DOCX XML ZIP]\n% MOCK DOCX CONTENT FOR TEMPLATE: ${template.name}\n% Variables: ${JSON.stringify(model.variables)}`
    );

    const prefix = options?.fileNamePrefix || 'document';

    return {
      format: this.format,
      content: mockContent,
      fileName: `${prefix}_${Date.now()}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }
}
