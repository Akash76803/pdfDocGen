export type ScalarFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'null';

export type NormalizedValue =
  | string
  | number
  | boolean
  | null
  | NormalizedRecord
  | NormalizedValue[];

export interface NormalizedRecord {
  [key: string]: NormalizedValue;
}

export interface FieldDefinition {
  name: string;
  label: string;
  type: ScalarFieldType | 'object' | 'array';
  required: boolean;
  nullable?: boolean;
  description?: string;
  originalLabel?: string;
}

export interface DataSourceSchema {
  fields: FieldDefinition[];
  metadata?: Record<string, unknown>;
}

export interface NormalizedData {
  schema: DataSourceSchema;
  records: NormalizedRecord[];
  metadata?: Record<string, unknown>;
  warnings?: DataWarning[];
}

export interface DataWarning {
  code: 'DUPLICATE_HEADER' | 'BLANK_HEADER' | 'LARGE_DATASET' | 'EMPTY_ROWS_SKIPPED';
  message: string;
  columnIndex?: number;
  rowIndex?: number;
}

export interface DataRequest {
  sourceOptions: Record<string, unknown>;
  fields?: string[];
  filter?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}
