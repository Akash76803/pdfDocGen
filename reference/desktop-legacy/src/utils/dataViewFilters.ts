import type { ConditionOperator, FieldDefinition, MappingDefinition, ScalarFieldType } from '@document-tool/contracts';


function rawSourceBindingPath(sourceField:string):string {
  const words=sourceField.trim().replace(/[^A-Za-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
  const [first='field',...rest]=words;
  const slug=(first.toLowerCase().replace(/^[^a-z_]+/,'')+rest.map((word)=>word.charAt(0).toUpperCase()+word.slice(1).toLowerCase()).join('')).replace(/[^A-Za-z0-9_]/g,'') || 'field';
  let hash=2166136261;
  for(const char of sourceField){hash^=char.codePointAt(0) ?? 0;hash=Math.imul(hash,16777619);}
  const key=`${/^[A-Za-z_]/.test(slug)?slug:`field${slug}`}_${(hash>>>0).toString(36)}`;
  return `source.${key}`;
}

export type FilterFieldType = ScalarFieldType | 'unknown';

export interface FilterBindingOption {
  value: string;
  label: string;
  sourceField?: string;
  role?: string;
  targetPath?: string;
  summaryAggregation?: 'SUM'|'FIRST'|'AVG'|'MIN'|'MAX'|'COUNT';
  dataType?: FilterFieldType;
  rawSource?: boolean;
}

const TEXT_OPERATORS: ConditionOperator[] = ['EQUALS','NOT_EQUALS','CONTAINS','NOT_CONTAINS','STARTS_WITH','ENDS_WITH','IS_EMPTY','NOT_EMPTY'];
const NUMBER_DATE_OPERATORS: ConditionOperator[] = ['EQUALS','NOT_EQUALS','GREATER_THAN','GREATER_OR_EQUAL','LESS_THAN','LESS_OR_EQUAL','IS_EMPTY','NOT_EMPTY'];
const BOOLEAN_OPERATORS: ConditionOperator[] = ['EQUALS','NOT_EQUALS'];
const UNKNOWN_OPERATORS: ConditionOperator[] = ['EQUALS','NOT_EQUALS','IS_EMPTY','NOT_EMPTY','GREATER_THAN','GREATER_OR_EQUAL','LESS_THAN','LESS_OR_EQUAL','CONTAINS','NOT_CONTAINS','STARTS_WITH','ENDS_WITH'];

export function operatorsForFilterType(type: FilterFieldType | undefined): ConditionOperator[] {
  if (type === 'string' || type === 'null') return TEXT_OPERATORS;
  if (type === 'number' || type === 'date' || type === 'datetime') return NUMBER_DATE_OPERATORS;
  if (type === 'boolean') return BOOLEAN_OPERATORS;
  return UNKNOWN_OPERATORS;
}

export function coerceFilterValue(raw: string, type: FilterFieldType | undefined): string | number | boolean {
  if (type === 'number') {
    if (raw.trim() === '') return '';
    const value = Number(raw);
    return Number.isFinite(value) ? value : raw;
  }
  if (type === 'boolean') return raw === 'true';
  return raw;
}

/**
 * Data View filters are row-level filters. Imported source columns that are not
 * mapped into the normalized collection are still filterable through $raw.<header>.
 * This keeps filtering independent from calculation/aggregation field restrictions.
 */
export function augmentFilterFieldsWithImportedSource(
  collectionPath: string,
  existing: FilterBindingOption[],
  schemaFields: FieldDefinition[],
  mappings: MappingDefinition[],
): FilterBindingOption[] {
  if (collectionPath !== 'items' && collectionPath !== 'sourceItems') return existing;

  const schemaByName = new Map(schemaFields.map((field) => [field.name, field] as const));
  const result = existing.map((option) => ({
    ...option,
    dataType: option.dataType ?? (option.sourceField ? schemaByName.get(option.sourceField)?.type as FilterFieldType | undefined : undefined),
  }));
  const representedSourceFields = new Set(result.map((option) => option.sourceField).filter((value): value is string => !!value));

  for (const field of schemaFields) {
    if (field.type === 'object' || field.type === 'array') continue;
    if (representedSourceFields.has(field.name)) continue;

    // Prefer a real mapping into this collection when one exists, regardless of
    // whether the field is useful for arithmetic. Otherwise use aligned raw source.
    const mapped = mappings.find((mapping) => mapping.role !== 'IGNORE' && mapping.sourceField === field.name && mapping.targetPath?.startsWith(`${collectionPath}.`));
    if (mapped?.targetPath) {
      result.push({
        value: mapped.targetPath.slice(collectionPath.length + 1),
        label: field.label || field.originalLabel || field.name,
        sourceField: field.name,
        role: mapped.role,
        targetPath: mapped.targetPath,
        summaryAggregation: mapped.summaryAggregation,
        dataType: field.type as FilterFieldType,
      });
    } else if (collectionPath === 'items') {
      result.push({
        value: rawSourceBindingPath(field.name),
        label: field.label || field.originalLabel || field.name,
        sourceField: field.name,
        targetPath: rawSourceBindingPath(field.name),
        dataType: field.type as FilterFieldType,
        rawSource: true,
      });
    } else {
      result.push({
        value: field.name,
        label: field.label || field.originalLabel || field.name,
        sourceField: field.name,
        targetPath: field.name,
        dataType: field.type as FilterFieldType,
        rawSource: true,
      });
    }
    representedSourceFields.add(field.name);
  }

  return result;
}
