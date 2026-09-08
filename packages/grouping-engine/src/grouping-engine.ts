import type {
  DocumentGroup,
  GroupingError,
  GroupingResult,
  GroupingStatistics,
  GroupingWarning,
  MappingDefinition,
  MappingProfile,
  NormalizedData,
  NormalizedRecord,
  NormalizedValue,
} from '@document-tool/contracts';
import { MappingEngine, sourceOf, targetOf } from '@document-tool/mapping-engine';

export interface IGroupingEngine {
  group(data: NormalizedData, mapping: MappingProfile): GroupingResult;
}

interface MutableGroup {
  id: string;
  key: string;
  header: NormalizedRecord;
  items: NormalizedRecord[];
  sourceItems: NormalizedRecord[];
  itemDetails: { data: NormalizedRecord; sourceRowIndex: number }[];
  sourceRowIndexes: number[];
  warnings: GroupingWarning[];
  headerSeen: Map<string, { value: NormalizedValue; sourceRows: number[]; values: NormalizedValue[] }>;
}

export class GroupingEngine implements IGroupingEngine {
  constructor(private readonly mappingEngine: MappingEngine = new MappingEngine()) {}

  group(data: NormalizedData, profile: MappingProfile): GroupingResult {
    const validation = this.mappingEngine.validate(profile, data.schema);
    if (!validation.valid) {
      return {
        groups: [],
        warnings: [],
        errors: validation.errors.map((issue) => ({ code: issue.code, message: issue.message })),
        statistics: stats(data.records.length, 0, 0, 0, 0),
      };
    }

    if (profile.groupDefinition.mode === 'ONE_ROW_PER_DOCUMENT') return this.groupOneRow(data, profile);
    if (profile.groupDefinition.mode === 'FULL_FILE_REPORT') return this.groupFullFile(data, profile);
    return this.groupByField(data, profile);
  }

  private groupByField(data: NormalizedData, profile: MappingProfile): GroupingResult {
    const groupKeyMapping = profile.mappings.find((mapping) => mapping.role === 'GROUP_KEY')!;
    const groupKeyField = sourceOf(groupKeyMapping)!;
    const headerMappings = profile.mappings.filter((mapping) => mapping.role === 'HEADER_FIELD' || mapping.role === 'GROUP_KEY');
    const itemMappings = profile.mappings.filter((mapping) => mapping.role === 'LINE_ITEM_FIELD' || mapping.role === 'SUMMARY_FIELD');
    const groups = new Map<string, MutableGroup>();
    const warnings: GroupingWarning[] = [];
    const errors: GroupingError[] = [];
    let skipped = 0;

    data.records.forEach((record, zeroIndex) => {
      const sourceRowIndex = sourceRowNumber(data, zeroIndex);
      const rawKey = record[groupKeyField];
      if (isBlank(rawKey)) {
        skipped += 1;
        warnings.push({ code: 'GROUP_KEY_MISSING', message: `Group key "${groupKeyField}" is blank at source row ${sourceRowIndex}.`, sourceField: groupKeyField, sourceRowIndexes: [sourceRowIndex] });
        return;
      }

      const displayKey = displayKeyOf(rawKey!);
      let group = groups.get(displayKey);
      if (!group) {
        group = createMutableGroup(profile.id, displayKey, groups.size);
        groups.set(displayKey, group);
      }
      group.sourceRowIndexes.push(sourceRowIndex);

      const mappedHeader = this.mappingEngine.mapRecord(record, headerMappings);
      this.mergeHeader(group, mappedHeader, headerMappings, record, displayKey, sourceRowIndex);

      const itemData = this.mappingEngine.mapRecord(record, itemMappings);
      group.items.push(itemData);
      group.sourceItems.push(record);
      group.itemDetails.push({ data: itemData, sourceRowIndex });
    });

    const output = Array.from(groups.values()).map(finalizeGroup);
    const invalidCount = output.filter((group) => !group.valid).length;
    if (output.length === 0) warnings.push({ code: 'NO_GROUPS_CREATED', message: 'No document groups could be created from the imported rows.' });
    for (const group of output) warnings.push(...group.warnings);

    return { groups: output, warnings, errors, statistics: stats(data.records.length, output.length, output.length - invalidCount, invalidCount, skipped, output) };
  }

  private groupOneRow(data: NormalizedData, profile: MappingProfile): GroupingResult {
    const headerMappings = profile.mappings.filter((mapping) => mapping.role !== 'IGNORE' && mapping.role !== 'LINE_ITEM_FIELD' && mapping.role !== 'SUMMARY_FIELD');
    const itemMappings = profile.mappings.filter((mapping) => mapping.role === 'LINE_ITEM_FIELD' || mapping.role === 'SUMMARY_FIELD');
    const keyMapping = profile.mappings.find((mapping) => mapping.role === 'GROUP_KEY');
    const groups: DocumentGroup[] = data.records.map((record, zeroIndex) => {
      const sourceRowIndex = sourceRowNumber(data, zeroIndex);
      const keySource = keyMapping ? sourceOf(keyMapping) : undefined;
      const candidate = keySource ? record[keySource] : undefined;
      const key = isBlank(candidate) ? `Row ${sourceRowIndex}` : displayKeyOf(candidate!);
      const item = this.mappingEngine.mapRecord(record, itemMappings);
      return {
        id: stableId(profile.id, key, zeroIndex), key,
        header: this.mappingEngine.mapRecord(record, headerMappings),
        items: itemMappings.length ? [item] : [],
        sourceItems: [record],
        itemDetails: itemMappings.length ? [{ data: item, sourceRowIndex }] : [],
        sourceRowIndexes: [sourceRowIndex], warnings: [], valid: true,
      };
    });
    return { groups, warnings: [], errors: [], statistics: stats(data.records.length, groups.length, groups.length, 0, 0, groups) };
  }

  private groupFullFile(data: NormalizedData, profile: MappingProfile): GroupingResult {
    const itemMappings = profile.mappings.filter((mapping) => mapping.role !== 'IGNORE');
    const items = data.records.map((record) => this.mappingEngine.mapRecord(record, itemMappings));
    const itemDetails = items.map((item, index) => ({ data: item, sourceRowIndex: sourceRowNumber(data, index) }));
    const group: DocumentGroup = {
      id: stableId(profile.id, 'FULL_FILE', 0), key: 'Full File Report', header: {}, items, sourceItems: data.records, itemDetails,
      sourceRowIndexes: itemDetails.map((item) => item.sourceRowIndex), warnings: [], valid: true,
    };
    return { groups: [group], warnings: [], errors: [], statistics: stats(data.records.length, 1, 1, 0, 0, [group]) };
  }

  private mergeHeader(group: MutableGroup, mappedHeader: NormalizedRecord, mappings: MappingDefinition[], source: NormalizedRecord, groupKey: string, sourceRowIndex: number): void {
    for (const mapping of mappings) {
      const sourceField = sourceOf(mapping);
      const targetPath = targetOf(mapping);
      if (!sourceField || !targetPath) continue;
      const value = source[sourceField];
      if (isBlank(value)) continue;

      const seen = group.headerSeen.get(targetPath);
      if (!seen) {
        group.headerSeen.set(targetPath, { value: value!, sourceRows: [sourceRowIndex], values: [value!] });
        setPath(group.header, targetPath, getPath(mappedHeader, targetPath) ?? value!);
        continue;
      }
      if (!equalValues(seen.value, value!)) {
        seen.sourceRows.push(sourceRowIndex);
        if (!seen.values.some((existing) => equalValues(existing, value!))) seen.values.push(value!);
        const already = group.warnings.some((warning) => warning.code === 'HEADER_VALUE_CONFLICT' && warning.targetPath === targetPath);
        if (!already) {
          group.warnings.push({
            code: 'HEADER_VALUE_CONFLICT',
            message: `Group ${groupKey} contains inconsistent values for ${sourceField}.`,
            groupKey, sourceField, targetPath, conflictingValues: [...seen.values], sourceRowIndexes: [...seen.sourceRows],
          });
        } else {
          const warning = group.warnings.find((entry) => entry.code === 'HEADER_VALUE_CONFLICT' && entry.targetPath === targetPath)!;
          warning.conflictingValues = [...seen.values]; warning.sourceRowIndexes = [...seen.sourceRows];
        }
      } else {
        seen.sourceRows.push(sourceRowIndex);
      }
    }
  }
}

function createMutableGroup(profileId: string, key: string, index: number): MutableGroup {
  return { id: stableId(profileId, key, index), key, header: {}, items: [], sourceItems: [], itemDetails: [], sourceRowIndexes: [], warnings: [], headerSeen: new Map() };
}

function finalizeGroup(group: MutableGroup): DocumentGroup {
  return { id: group.id, key: group.key, header: group.header, items: group.items, sourceItems: group.sourceItems, itemDetails: group.itemDetails, sourceRowIndexes: group.sourceRowIndexes, warnings: group.warnings, valid: group.warnings.every((warning) => warning.code !== 'HEADER_VALUE_CONFLICT') };
}

function sourceRowNumber(data: NormalizedData, zeroIndex: number): number {
  const headerRow = typeof data.metadata?.headerRow === 'number' ? data.metadata.headerRow : 1;
  return headerRow + 1 + zeroIndex;
}

function displayKeyOf(value: NormalizedValue): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function isBlank(value: NormalizedValue | undefined): boolean { return value == null || (typeof value === 'string' && value.trim() === ''); }
function equalValues(a: NormalizedValue, b: NormalizedValue): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function stableId(profileId: string, key: string, index: number): string { return `${profileId}:${index}:${key}`; }

function getPath(record: NormalizedRecord, path: string): NormalizedValue | undefined {
  let current: NormalizedValue | undefined = record;
  for (const part of path.split('.')) {
    if (!current || Array.isArray(current) || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}
function setPath(record: NormalizedRecord, path: string, value: NormalizedValue): void {
  const parts = path.split('.'); let current = record;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) current[part] = value;
    else { if (!current[part] || Array.isArray(current[part]) || typeof current[part] !== 'object') current[part] = {}; current = current[part] as NormalizedRecord; }
  });
}
function stats(sourceRows: number, groupCount: number, valid: number, invalid: number, skipped: number, groups: DocumentGroup[] = []): GroupingStatistics {
  return { sourceRowCount: sourceRows, groupCount, validGroupCount: valid, invalidGroupCount: invalid, skippedRowCount: skipped, largestGroupSize: groups.reduce((max, group) => Math.max(max, group.sourceRowIndexes.length), 0) };
}
