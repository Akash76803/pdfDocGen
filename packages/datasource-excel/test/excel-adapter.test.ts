import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { ExcelDataSourceAdapter } from '../src/excel-adapter.js';
import type { SourceFileInput } from '@document-tool/datasource-sdk';

function fixture(name: string): SourceFileInput {
  const buffer = readFileSync(resolve(process.cwd(), 'fixtures', name));
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return { name, extension: 'xlsx', size: buffer.byteLength, bytes };
}

function generatedWorkbook(rows: unknown[][], formats: Record<string, string>): SourceFileInput {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  for (const [address, format] of Object.entries(formats)) {
    const cell = sheet[address];
    if (cell) cell.z = format;
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Profiles');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellDates: false }) as ArrayBuffer;
  return { name: 'generated-dates.xlsx', extension: 'xlsx', size: bytes.byteLength, bytes };
}

function excelSerial(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  return Date.UTC(year, month - 1, day, hour, minute, second) / 86_400_000 + 25_569;
}

describe('ExcelDataSourceAdapter', () => {
  it('discovers workbook sheets and defaults to first visible sheet', () => {
    const adapter = new ExcelDataSourceAdapter();
    const info = adapter.inspect(fixture('multiple-sheets.xlsx'));
    expect(info.sheets.map((s) => s.name)).toEqual(['Summary', 'Invoices']);
    expect(info.defaultSheetName).toBe('Summary');
  });

  it('parses basic Excel data and native numbers', async () => {
    const adapter = new ExcelDataSourceAdapter();
    const data = await adapter.getData({ sourceOptions: { file: fixture('basic.xlsx'), headerRow: 1 } });
    expect(data.records).toHaveLength(2);
    expect(data.records[0]?.Amount).toBe(5000);
    expect(data.schema.fields.find((f) => f.name === 'Amount')?.type).toBe('number');
  });

  it('supports custom header rows and skips trailing empty rows', async () => {
    const adapter = new ExcelDataSourceAdapter();
    const data = await adapter.getData({
      sourceOptions: { file: fixture('custom-header-row.xlsx'), sheetName: 'Invoices', headerRow: 3 },
    });
    expect(data.schema.fields.map((f) => f.name)).toEqual(['Invoice No', 'Customer', 'Amount']);
    expect(data.records).toHaveLength(2);
  });

  it('handles duplicate and blank headers with warnings', async () => {
    const adapter = new ExcelDataSourceAdapter();
    const data = await adapter.getData({ sourceOptions: { file: fixture('duplicate-headers.xlsx'), headerRow: 1 } });
    expect(data.schema.fields.map((f) => f.name)).toEqual(['Name', 'Name_2', 'Column_3', 'Amount']);
    expect(data.warnings?.some((w) => w.code === 'DUPLICATE_HEADER')).toBe(true);
    expect(data.warnings?.some((w) => w.code === 'BLANK_HEADER')).toBe(true);
  });

  it('preserves Excel date-only cells as DATE without timezone-derived time', async () => {
    const adapter = new ExcelDataSourceAdapter();
    const serialWithHiddenTime = excelSerial(1995, 7, 10, 18, 29, 50);
    const file = generatedWorkbook(
      [['DOB'], [serialWithHiddenTime]],
      { A2: 'dd-mmm-yyyy' }
    );

    const data = await adapter.getData({ sourceOptions: { file, headerRow: 1 } });

    expect(data.schema.fields.find((field) => field.name === 'DOB')?.type).toBe('date');
    expect(data.records[0]?.DOB).toBe('1995-07-10');
  });

  it('keeps Excel cells with an actual time-bearing format as DATETIME', async () => {
    const adapter = new ExcelDataSourceAdapter();
    const serial = excelSerial(1995, 7, 10, 18, 29, 50);
    const file = generatedWorkbook(
      [['Created At'], [serial]],
      { A2: 'dd-mmm-yyyy hh:mm:ss' }
    );

    const data = await adapter.getData({ sourceOptions: { file, headerRow: 1 } });

    expect(data.schema.fields.find((field) => field.name === 'Created At')?.type).toBe('datetime');
    expect(data.records[0]?.['Created At']).toBe('1995-07-10T18:29:50.000Z');
  });

  it('rejects an empty sheet', async () => {
    const adapter = new ExcelDataSourceAdapter();
    await expect(adapter.getData({ sourceOptions: { file: fixture('empty.xlsx') } })).rejects.toThrow(/contains no data/);
  });
});
