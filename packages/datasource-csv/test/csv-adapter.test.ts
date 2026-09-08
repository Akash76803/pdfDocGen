import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CsvDataSourceAdapter } from '../src/csv-adapter.js';
import type { SourceFileInput } from '@document-tool/datasource-sdk';

function fixture(name: string): SourceFileInput {
  const buffer = readFileSync(resolve(process.cwd(), 'fixtures', name));
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return { name, extension: 'csv', size: buffer.byteLength, bytes };
}

describe('CsvDataSourceAdapter', () => {
  it('parses normal CSV and infers basic values', async () => {
    const adapter = new CsvDataSourceAdapter();
    const data = await adapter.getData({ sourceOptions: { file: fixture('basic.csv'), headerRow: 1 } });
    expect(data.records).toHaveLength(2);
    expect(data.records[0]?.Amount).toBe(5000);
    expect(data.records[0]?.Active).toBe(true);
  });

  it('parses quoted commas and escaped quotes while preserving leading zeros', async () => {
    const adapter = new CsvDataSourceAdapter();
    const data = await adapter.getData({ sourceOptions: { file: fixture('quoted.csv'), headerRow: 1 } });
    expect(data.records[0]?.Code).toBe('00123');
    expect(data.records[0]?.Customer).toBe('ABC, Traders');
    expect(data.records[0]?.Note).toBe('He said "hello"');
  });

  it('supports custom header row', async () => {
    const adapter = new CsvDataSourceAdapter();
    const data = await adapter.getData({ sourceOptions: { file: fixture('custom-header-row.csv'), headerRow: 3 } });
    expect(data.records).toHaveLength(2);
    expect(data.schema.fields.map((f) => f.name)).toEqual(['InvoiceNo', 'Customer', 'Amount']);
  });

  it('reports duplicate and blank headers', async () => {
    const adapter = new CsvDataSourceAdapter();
    const data = await adapter.getData({ sourceOptions: { file: fixture('duplicate-headers.csv'), headerRow: 1 } });
    expect(data.schema.fields.map((f) => f.name)).toEqual(['Name', 'Name_2', 'Column_3', 'Amount']);
    expect(data.warnings).toHaveLength(2);
  });

  it('rejects an empty CSV', async () => {
    const adapter = new CsvDataSourceAdapter();
    await expect(adapter.getData({ sourceOptions: { file: fixture('empty.csv') } })).rejects.toThrow(/empty/);
  });
});
