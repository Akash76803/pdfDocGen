import {
  TemplateDefinition,
  NormalizedData,
  GenerationResult,
  GeneratedDocument,
  RenderModel,
  DocumentFormat,
} from '@document-tool/contracts';
import { IMappingEngine } from '@document-tool/mapping-engine';
import { ICalculationEngine } from '@document-tool/calculation-engine';
import { LegacyDocumentRenderer } from '@document-tool/renderer-sdk';

export class DocumentGenerationService {
  constructor(
    private mappingEngine: IMappingEngine,
    private calculationEngine: ICalculationEngine,
    private renderers: Map<DocumentFormat, LegacyDocumentRenderer>
  ) {}

  async generate(
    template: TemplateDefinition,
    data: NormalizedData,
    format: DocumentFormat
  ): Promise<GenerationResult> {
    const startTime = Date.now();
    const documents: GeneratedDocument[] = [];

    const renderer = this.renderers.get(format);
    if (!renderer) {
      return {
        success: false,
        documents: [],
        error: `Renderer for format "${format}" not registered.`,
        elapsedMs: Date.now() - startTime,
      };
    }

    try {
      for (let i = 0; i < data.records.length; i++) {
        const record = data.records[i];

        // 1. Run Mapping Engine
        const mappedVariables = this.mappingEngine.mapRecord(record, (template.mappings ?? []));

        // 2. Run Calculation Engine
        const finalVariables = this.calculationEngine.calculate(mappedVariables, (template.calculations ?? []), record);

        // 3. Construct Render Model
        const renderModel: RenderModel = {
          variables: finalVariables,
          metadata: {
            recordIndex: i,
            totalRecords: data.records.length,
          },
        };

        // 4. Invoke Selected Renderer
        const doc = await renderer.render(template, renderModel, {
          fileNamePrefix: `${template.id}_record_${i + 1}`,
        });

        documents.push(doc);
      }

      return {
        success: true,
        documents,
        elapsedMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        documents: [],
        error: err.message || String(err),
        elapsedMs: Date.now() - startTime,
      };
    }
  }
}
