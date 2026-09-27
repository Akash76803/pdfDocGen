import type { NormalizedRecord } from '@document-tool/contracts';
import type { BuilderDataSource } from './dataSourceStore.ts';
import { displayValue, valueForField } from './dataSourceStore.ts';

/** Store only a source reference and a column key; never persist imported records inside template JSON. */
export type TemplateDataConfiguration = {
  sourceId: string | null;
  sourceName?: string;
  documentIdField: string | null;
};

export function resolveTemplateDataSource(
  sources: BuilderDataSource[],
  config: TemplateDataConfiguration | null,
): BuilderDataSource | null {
  if (!config?.sourceId) return null;
  // A renamed or reimported source may get a new ID; the name is a recovery hint.
  return sources.find((source) => source.id === config.sourceId)
    ?? (config.sourceName ? sources.find((source) => source.name === config.sourceName) : undefined)
    ?? null;
}

export function resolveDocumentIdentityKeys(
  config: TemplateDataConfiguration | null,
  source: BuilderDataSource,
  legacyKeys: string[],
): string[] {
  const selected = config?.documentIdField;
  if (selected && source.fields.some((field) => field.name === selected)) return [selected];
  // Backwards-compatible behavior for templates created with a dynamic table.
  return legacyKeys.filter((key) => source.fields.some((field) => field.name === key));
}

export function groupedDocumentRecords(
  records: NormalizedRecord[],
  selectedRecord: NormalizedRecord | null,
  keys: string[],
): NormalizedRecord[] {
  if (!selectedRecord || keys.length === 0) return records;
  const identity = keys.map((key) => displayValue(valueForField(selectedRecord, key)).trim());
  if (identity.every((part) => !part)) return [selectedRecord]; // Do not sum unrelated blank IDs.
  return records.filter((row) =>
    keys.every((key, index) => displayValue(valueForField(row, key)).trim() === identity[index]));
}

export function documentPreviewOptions(
  source: BuilderDataSource,
  keys: string[],
): Array<{ value: number; label: string }> {
  if (keys.length === 0) return [];
  const options = new Map<string, { value: number; label: string }>();
  const labels = keys.map((key) => source.fields.find((field) => field.name === key)?.label || key);
  source.records.forEach((record, index) => {
    const values = keys.map((key) => displayValue(valueForField(record, key)).trim());
    if (values.every((value) => !value)) return;
    const identity = values.join('\u241f');
    if (!options.has(identity)) options.set(identity, {
      value: index,
      label: keys.length === 1 ? values[0] : labels.map((label, pos) => `${label}: ${values[pos]}`).join(' · '),
    });
  });
  return [...options.values()];
}
