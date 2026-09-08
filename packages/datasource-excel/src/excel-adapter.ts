import * as XLSX from 'xlsx';
import type { DataSourceAdapter, DataSourceInput, SheetInfo, SourceFileInput } from '@document-tool/datasource-sdk';
import { inferExcelValue, mergeFieldTypes, processHeaders } from '@document-tool/datasource-sdk';
import type {
  DataRequest,
  DataSourceSchema,
  DataWarning,
  FieldDefinition,
  NormalizedData,
  NormalizedRecord,
  NormalizedValue,
  ScalarFieldType,
} from '@document-tool/contracts';

export interface ExcelInspection {
  sheets: SheetInfo[];
  defaultSheetName?: string;
  suggestedHeaderRow: number;
}

export class ExcelDataSourceAdapter implements DataSourceAdapter {
  readonly type = 'excel';

  inspect(file: SourceFileInput): ExcelInspection {
    const workbook = this.readWorkbook(file);
    const sheets: SheetInfo[] = workbook.SheetNames.map((name: string, index: number) => ({
      name,
      index,
      hidden: Boolean(workbook.Workbook?.Sheets?.[index]?.Hidden),
    }));
    const firstVisible = sheets.find((sheet) => !sheet.hidden) ?? sheets[0];
    const suggestedHeaderRow = firstVisible
      ? detectHeaderRow(workbook.Sheets[firstVisible.name])
      : 1;

    return {
      sheets,
      defaultSheetName: firstVisible?.name,
      suggestedHeaderRow,
    };
  }

  async getSchema(input: DataSourceInput): Promise<DataSourceSchema> {
    if (!input.file) throw new Error('Excel file bytes are required.');
    const data = this.parse(input.file, {
      sheetName: stringOption(input.options?.sheetName),
      headerRow: numberOption(input.options?.headerRow),
    });
    return data.schema;
  }

  async getData(request: DataRequest): Promise<NormalizedData> {
    const file = request.sourceOptions.file as SourceFileInput | undefined;
    if (!file) throw new Error('Excel file bytes are required.');
    return this.parse(file, {
      sheetName: stringOption(request.sourceOptions.sheetName),
      headerRow: numberOption(request.sourceOptions.headerRow),
    });
  }

  private parse(
    file: SourceFileInput,
    options: { sheetName?: string; headerRow?: number }
  ): NormalizedData {
    const workbook = this.readWorkbook(file);
    if (workbook.SheetNames.length === 0) throw new Error('The Excel workbook contains no sheets.');

    const inspection = this.inspect(file);
    const sheetName = options.sheetName ?? inspection.defaultSheetName ?? workbook.SheetNames[0]!;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`The selected sheet "${sheetName}" does not exist.`);

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });

    if (rows.length === 0 || rows.every(isEmptyRow)) {
      throw new Error(`The selected sheet "${sheetName}" contains no data.`);
    }

    const headerRow = options.headerRow ?? detectHeaderRow(sheet);
    if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > rows.length) {
      throw new Error(`Header row ${headerRow} is outside the available data range (1-${rows.length}).`);
    }

    const rawHeaders = rows[headerRow - 1] ?? [];
    const lastMeaningfulColumn = findLastMeaningfulColumn(rows, headerRow - 1);
    const headersInput = Array.from({ length: lastMeaningfulColumn + 1 }, (_, i) => rawHeaders[i] ?? null);
    if (headersInput.length === 0) throw new Error('No columns were found after the selected header row.');

    const processed = processHeaders(headersInput);
    const records: NormalizedRecord[] = [];
    const fieldTypes = new Map<string, ScalarFieldType[]>();
    const nullCounts = new Map<string, number>();
    let emptyRowsSkipped = 0;

    for (let rowIndex = headerRow; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      if (isEmptyRow(row)) {
        emptyRowsSkipped += 1;
        continue;
      }

      const record: NormalizedRecord = {};
      for (const header of processed.headers) {
        const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: header.columnIndex })];
        const inferred = inferExcelCellValue(row[header.columnIndex], cell);
        record[header.key] = toNormalizedValue(inferred.value, inferred.type);
        const list = fieldTypes.get(header.key) ?? [];
        list.push(inferred.type);
        fieldTypes.set(header.key, list);
        if (inferred.type === 'null') nullCounts.set(header.key, (nullCounts.get(header.key) ?? 0) + 1);
      }
      records.push(record);
    }

    const warnings: DataWarning[] = [...processed.warnings];
    if (emptyRowsSkipped > 0) {
      warnings.push({
        code: 'EMPTY_ROWS_SKIPPED',
        message: `${emptyRowsSkipped} empty row(s) were skipped.`,
      });
    }
    if (records.length > 10000) {
      warnings.push({
        code: 'LARGE_DATASET',
        message: `This sheet contains ${records.length.toLocaleString()} data rows. Preview is limited for responsiveness.`,
      });
    }

    const fields: FieldDefinition[] = processed.headers.map((header) => {
      const types = fieldTypes.get(header.key) ?? ['null'];
      const nullable = (nullCounts.get(header.key) ?? 0) > 0;
      return {
        name: header.key,
        label: header.label,
        originalLabel: header.originalLabel,
        type: mergeFieldTypes(types),
        required: records.length > 0 && !nullable,
        nullable,
      };
    });

    return {
      schema: {
        fields,
        metadata: { sourceType: 'excel', sheetName, headerRow },
      },
      records,
      warnings,
      metadata: {
        sourceFileName: file.name,
        sourceType: 'excel',
        sheetName,
        headerRow,
        totalRows: records.length,
        totalColumns: fields.length,
      },
    };
  }

  private readWorkbook(file: SourceFileInput): XLSX.WorkBook {
    try {
      if (!file.bytes || file.bytes.byteLength === 0) throw new Error('The selected Excel file is empty.');
      // Keep Excel date cells as their raw serial numbers and retain the number format.
      // This lets us distinguish a DATE from a DATETIME using the workbook's
      // actual cell format instead of timezone-sensitive JavaScript Date values.
      return XLSX.read(file.bytes, { type: 'array', cellDates: false, cellNF: true, cellText: false });
    } catch (error) {
      if (error instanceof Error && error.message === 'The selected Excel file is empty.') throw error;
      throw new Error('Unable to read this Excel workbook. The file may be corrupted or password protected.');
    }
  }
}

function inferExcelCellValue(value: unknown, cell: XLSX.CellObject | undefined): ReturnType<typeof inferExcelValue> {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    cell?.t === 'n' &&
    typeof cell.z === 'string' &&
    XLSX.SSF.is_date(cell.z)
  ) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && isValidExcelDateParts(parsed.y, parsed.m, parsed.d)) {
      if (!excelDateFormatHasTime(cell.z)) {
        return { value: formatYmd(parsed.y, parsed.m, parsed.d), type: 'date' };
      }

      return {
        value: formatExcelDateTime(parsed.y, parsed.m, parsed.d, parsed.H, parsed.M, parsed.S, parsed.u),
        type: 'datetime',
      };
    }
  }

  return inferExcelValue(value);
}

function excelDateFormatHasTime(format: string): boolean {
  // Quoted text and escaped characters are literals. Elapsed-time tokens such as
  // [h] / [m] / [s] are explicitly time-bearing and must remain DATETIME.
  if (/\[(?:h+|m+|s+)\]/i.test(format)) return true;

  const semantic = format
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/AM\/PM|A\/P/gi, ' h ');

  // `m` is ambiguous (month vs minute), so only use unambiguous hour/second
  // tokens here. A normal date-time format containing minutes also contains an
  // hour or second token (for example hh:mm or mm:ss).
  return /h|s/i.test(semantic);
}

function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

function formatExcelDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  fraction: number
): string {
  const milliseconds = Math.max(0, Math.min(999, Math.round((fraction || 0) * 1000)));
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, milliseconds)).toISOString();
}

function pad2(value: number): string {
  return String(Math.trunc(value)).padStart(2, '0');
}

function isValidExcelDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

function detectHeaderRow(sheet: XLSX.WorkSheet | undefined): number {
  if (!sheet) return 1;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true });
  const scanLimit = Math.min(rows.length, 25);
  let bestIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i] ?? [];
    const meaningful = row.filter((value: unknown) => value !== null && value !== undefined && String(value).trim() !== '').length;
    const strings = row.filter((value: unknown) => typeof value === 'string' && value.trim() !== '').length;
    const score = meaningful * 2 + strings;
    if (meaningful >= 2 && score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex + 1;
}

function findLastMeaningfulColumn(rows: unknown[][], headerIndex: number): number {
  let last = -1;
  for (const row of rows.slice(headerIndex)) {
    row.forEach((value, index) => {
      if (value !== null && value !== undefined && String(value).trim() !== '') last = Math.max(last, index);
    });
  }
  return last;
}

function isEmptyRow(row: unknown[]): boolean {
  return row.every((value) => value === null || value === undefined || String(value).trim() === '');
}

function toNormalizedValue(value: string | number | boolean | Date | null, type: ScalarFieldType): NormalizedValue {
  if (value instanceof Date) return type === 'date' ? value.toISOString().slice(0, 10) : value.toISOString();
  return value;
}

function stringOption(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberOption(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
