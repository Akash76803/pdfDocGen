import type { DataSourceSchema, NormalizedData, DataRequest } from '@document-tool/contracts';
import type { SourceFileInput } from './types.js';

export interface DataSourceInput {
  sourceType: string;
  sourceUri?: string;
  file?: SourceFileInput;
  options?: Record<string, unknown>;
}

export interface DataSourceAdapter {
  readonly type: string;
  getSchema(input: DataSourceInput): Promise<DataSourceSchema>;
  getData(request: DataRequest): Promise<NormalizedData>;
}
