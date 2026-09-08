import type { NormalizedRecord, NormalizedValue } from './data.js';

export type SummaryAggregation = 'SUM' | 'FIRST' | 'AVG' | 'MIN' | 'MAX' | 'COUNT';
export type FieldRole = 'GROUP_KEY' | 'HEADER_FIELD' | 'LINE_ITEM_FIELD' | 'SUMMARY_FIELD' | 'IGNORE';
export type GroupingMode = 'GROUP_BY_FIELD' | 'ONE_ROW_PER_DOCUMENT' | 'FULL_FILE_REPORT';

export interface MappingTarget {
  path: string;
  label?: string;
}

export interface MappingDefinition {
  id: string;
  /** Phase 2 source column/key. */
  sourceField?: string;
  /** Phase 2 canonical target path, e.g. customer.name or items.qty. */
  targetPath?: string;
  role?: FieldRole;
  required?: boolean;
  /** Default aggregation used when this mapping is selected in a Summary/Table Footer control. */
  summaryAggregation?: SummaryAggregation;

  /** @deprecated Phase 0 compatibility alias for sourceField. */
  sourcePath?: string;
  /** @deprecated Phase 0 compatibility alias for targetPath. */
  templateVariable?: string;

  defaultValue?: NormalizedValue;
  transformRules?: {
    type: 'uppercase' | 'lowercase' | 'date_format' | 'number_format' | 'trim';
    formatPattern?: string;
  }[];
}

export interface GroupKeyDefinition {
  sourceField?: string;
  targetPath?: string;
}

export interface GroupDefinition {
  mode: GroupingMode;
  groupKey?: GroupKeyDefinition;
}

export interface MappingProfile {
  id: string;
  name: string;
  sourceType?: string;
  mappings: MappingDefinition[];
  groupDefinition: GroupDefinition;
}

export type MappingErrorCode =
  | 'MAPPING_REQUIRED'
  | 'MAPPING_SOURCE_NOT_FOUND'
  | 'MAPPING_TARGET_DUPLICATE'
  | 'MAPPING_ROLE_CONFLICT'
  | 'MAPPING_TARGET_INVALID'
  | 'GROUP_KEY_REQUIRED';

export interface MappingValidationIssue {
  code: MappingErrorCode;
  message: string;
  mappingId?: string;
  sourceField?: string;
  targetPath?: string;
}

export interface MappingValidationResult {
  valid: boolean;
  errors: MappingValidationIssue[];
  warnings: MappingValidationIssue[];
}

export type GroupingWarningCode =
  | 'GROUP_KEY_MISSING'
  | 'HEADER_VALUE_CONFLICT'
  | 'NO_GROUPS_CREATED';

export interface GroupingWarning {
  code: GroupingWarningCode;
  message: string;
  groupKey?: string;
  sourceField?: string;
  targetPath?: string;
  conflictingValues?: NormalizedValue[];
  sourceRowIndexes?: number[];
}

export interface GroupingError {
  code: MappingErrorCode | GroupingWarningCode;
  message: string;
  sourceRowIndex?: number;
}

export interface GroupItem {
  data: NormalizedRecord;
  sourceRowIndex: number;
}

export interface DocumentGroup {
  /** Stable runtime id. Not assumed to equal the display key. */
  id: string;
  key: string;
  header: NormalizedRecord;
  items: NormalizedRecord[];
  /** Original imported rows for template-design-time source-header binding. Not persisted in templates. */
  sourceItems?: NormalizedRecord[];
  itemDetails: GroupItem[];
  sourceRowIndexes: number[];
  warnings: GroupingWarning[];
  valid: boolean;
}

export interface GroupingStatistics {
  sourceRowCount: number;
  groupCount: number;
  validGroupCount: number;
  invalidGroupCount: number;
  skippedRowCount: number;
  largestGroupSize: number;
}

export interface GroupingResult {
  groups: DocumentGroup[];
  warnings: GroupingWarning[];
  errors: GroupingError[];
  statistics: GroupingStatistics;
}
