import Papa from 'papaparse';
import type { DataSourceAdapter, DataSourceInput, SourceFileInput } from '@document-tool/datasource-sdk';
import { inferCsvValue, mergeFieldTypes, processHeaders } from '@document-tool/datasource-sdk';
import type {
  DataRequest,
  DataSourceSchema,
  DataWarning,
  FieldDefinition,
  NormalizedData,
  NormalizedRecord,
  ScalarFieldType,
} from '@document-tool/contracts';

export class CsvDataSourceAdapter implements DataSourceAdapter {
  readonly type = 'csv';

  async getSchema(input: DataSourceInput): Promise<DataSourceSchema> {
    if (!input.file) throw new Error('CSV file bytes are required.');
    return this.parse(input.file, numberOption(input.options?.headerRow)).schema;
  }

  async getData(request: DataRequest): Promise<NormalizedData> {
    const file = request.sourceOptions.file as SourceFileInput | undefined;
    if (!file) throw new Error('CSV file bytes are required.');
    return this.parse(file, numberOption(request.sourceOptions.headerRow));
  }

  private parse(file: SourceFileInput, requestedHeaderRow?: number): NormalizedData {
    if (!file.bytes || file.bytes.byteLength === 0) throw new Error('The selected CSV file is empty.');

    const text = new TextDecoder('utf-8', { fatal: false }).decode(file.bytes).replace(/^\uFEFF/, '');
    const result = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: false,
      dynamicTyping: false,
    });

    if (result.errors.length > 0) {
      const first = result.errors[0]!;
      throw new Error(`Unable to read this CSV file. ${first.message}`);
    }

    const rows = trimTrailingEmptyRows(result.data);
    if (rows.length === 0 || rows.every(isEmptyRow)) throw new Error('The selected CSV file contains no data.');

    const headerRow = requestedHeaderRow ?? detectHeaderRow(rows);
    if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > rows.length) {
      throw new Error(`Header row ${headerRow} is outside the available data range (1-${rows.length}).`);
    }

    const lastMeaningfulColumn = findLastMeaningfulColumn(rows, headerRow - 1);
    const rawHeader = rows[headerRow - 1] ?? [];
    const headerValues = Array.from({ length: lastMeaningfulColumn + 1 }, (_, i) => rawHeader[i] ?? '');
    if (headerValues.length === 0) throw new Error('No columns were found after the selected header row.');

    const processed = processHeaders(headerValues);
    const records: NormalizedRecord[] = [];
    const fieldTypes = new Map<string, ScalarFieldType[]>();
    const nullCounts = new Map<string, number>();
    let emptyRowsSkipped = 0;

    for (const row of rows.slice(headerRow)) {
      if (isEmptyRow(row)) {
        emptyRowsSkipped += 1;
        continue;
      }

      const record: NormalizedRecord = {};
      for (const header of processed.headers) {
        const inferred = inferCsvValue(row[header.columnIndex] ?? '');
        record[header.key] = inferred.value instanceof Date ? inferred.value.toISOString() : inferred.value;
        const types = fieldTypes.get(header.key) ?? [];
        types.push(inferred.type);
        fieldTypes.set(header.key, types);
        if (inferred.type === 'null') nullCounts.set(header.key, (nullCounts.get(header.key) ?? 0) + 1);
      }
      records.push(record);
    }

    const warnings: DataWarning[] = [...processed.warnings];
    if (emptyRowsSkipped > 0) warnings.push({ code: 'EMPTY_ROWS_SKIPPED', message: `${emptyRowsSkipped} empty row(s) were skipped.` });
    if (records.length > 10000) warnings.push({ code: 'LARGE_DATASET', message: `This CSV contains ${records.length.toLocaleString()} data rows. Preview is limited for responsiveness.` });

    const fields: FieldDefinition[] = processed.headers.map((header) => {
      const nullable = (nullCounts.get(header.key) ?? 0) > 0;
      return {
        name: header.key,
        label: header.label,
        originalLabel: header.originalLabel,
        type: mergeFieldTypes(fieldTypes.get(header.key) ?? ['null']),
        required: records.length > 0 && !nullable,
        nullable,
      };
    });

    return {
      schema: { fields, metadata: { sourceType: 'csv', headerRow } },
      records,
      warnings,
      metadata: {
        sourceFileName: file.name,
        sourceType: 'csv',
        headerRow,
        totalRows: records.length,
        totalColumns: fields.length,
      },
    };
  }
}

function trimTrailingEmptyRows(rows: string[][]): string[][] {
  let end = rows.length;
  while (end > 0 && isEmptyRow(rows[end - 1] ?? [])) {
    end -= 1;
  }
  return rows.slice(0, end);
}

function detectHeaderRow(rows: string[][]): number {
  const scanLimit = Math.min(rows.length, 25);
  let bestIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i] ?? [];
    const meaningful = row.filter((value) => value.trim() !== '').length;
    const textCells = row.filter((value) => value.trim() !== '' && !/^-?\d+(?:\.\d+)?$/.test(value.trim())).length;
    const score = meaningful * 2 + textCells;
    if (meaningful >= 2 && score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex + 1;
}

function findLastMeaningfulColumn(rows: string[][], headerIndex: number): number {
  let last = -1;
  for (const row of rows.slice(headerIndex)) {
    row.forEach((value, index) => {
      if (value.trim() !== '') last = Math.max(last, index);
    });
  }
  return last;
}

function isEmptyRow(row: string[]): boolean {
  return row.every((value) => value == null || value.trim() === '');
}

function numberOption(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
