import { CsvDataSourceAdapter } from '@document-tool/datasource-csv';
import { ExcelDataSourceAdapter } from '@document-tool/datasource-excel';
import type { FileInspectionResult, SourceFileInput, SourceFileType } from '@document-tool/datasource-sdk';
import type { NormalizedData } from '@document-tool/contracts';

export interface LoadDataOptions {
  sheetName?: string;
  headerRow?: number;
}

export class ImportDataService {
  private readonly excel = new ExcelDataSourceAdapter();
  private readonly csv = new CsvDataSourceAdapter();

  inspectFile(file: SourceFileInput): FileInspectionResult {
    const sourceType = this.detectSourceType(file);
    if (sourceType === 'excel') {
      const inspection = this.excel.inspect(file);
      return {
        sourceType,
        fileName: file.name,
        fileSize: file.size,
        sheets: inspection.sheets,
        defaultSheetName: inspection.defaultSheetName,
        suggestedHeaderRow: inspection.suggestedHeaderRow,
      };
    }

    return {
      sourceType,
      fileName: file.name,
      fileSize: file.size,
      suggestedHeaderRow: 1,
    };
  }

  async loadData(file: SourceFileInput, options: LoadDataOptions = {}): Promise<NormalizedData> {
    const sourceType = this.detectSourceType(file);
    if (sourceType === 'excel') {
      return this.excel.getData({
        sourceOptions: {
          file,
          sheetName: options.sheetName,
          headerRow: options.headerRow,
        },
      });
    }

    return this.csv.getData({
      sourceOptions: {
        file,
        headerRow: options.headerRow,
      },
    });
  }

  detectSourceType(file: SourceFileInput): SourceFileType {
    const ext = file.extension.toLowerCase().replace(/^\./, '');
    if (ext === 'xlsx') return 'excel';
    if (ext === 'csv') return 'csv';
    throw new Error('Unsupported file type. Supported formats are XLSX and CSV.');
  }
}
