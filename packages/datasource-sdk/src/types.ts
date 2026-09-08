import type { DataWarning, ScalarFieldType } from '@document-tool/contracts';

export type SourceFileType = 'excel' | 'csv';

export interface SourceFileInput {
  name: string;
  extension: string;
  size?: number;
  bytes: ArrayBuffer;
}

export interface SheetInfo {
  name: string;
  index: number;
  hidden?: boolean;
}

export interface ImportOptions {
  sheetName?: string;
  headerRow?: number; // 1-based for user-facing compatibility
}

export interface InferredValue {
  value: string | number | boolean | Date | null;
  type: ScalarFieldType;
}

export interface ProcessedHeader {
  key: string;
  label: string;
  originalLabel: string;
  columnIndex: number;
}

export interface HeaderProcessingResult {
  headers: ProcessedHeader[];
  warnings: DataWarning[];
}

export interface FileInspectionResult {
  sourceType: SourceFileType;
  fileName: string;
  fileSize?: number;
  sheets?: SheetInfo[];
  defaultSheetName?: string;
  suggestedHeaderRow: number;
}
