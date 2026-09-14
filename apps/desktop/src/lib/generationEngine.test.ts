import { describe, expect, it } from 'vitest';
import { buildDocumentOptions, resolveFileNamePattern, sanitizeGeneratedFileName, validateGeneration } from './generationEngine.ts';
import type { BuilderDataSource } from './dataSourceStore.ts';

const source: BuilderDataSource = {
  id: 'invoice-source', name: 'Invoices', sourceType: 'csv', importedAt: '2026-09-14', warnings: [],
  fields: [
    { name: 'InvoiceNo', label: 'Invoice No', type: 'string' },
    { name: 'Customer Name', label: 'Customer Name', type: 'string' },
  ] as BuilderDataSource['fields'],
  records: [
    { InvoiceNo: 'INV/001', 'Customer Name': 'ABC Traders' },
    { InvoiceNo: 'INV/001', 'Customer Name': 'ABC Traders' },
    { InvoiceNo: 'INV/002', 'Customer Name': 'XYZ Ltd' },
  ],
};

describe('DB-5B generation engine helpers', () => {
  it('collapses flat line-item rows into one document option per parent ID', () => {
    expect(buildDocumentOptions(source, ['InvoiceNo']).map((item) => item.value)).toEqual([0, 2]);
  });

  it('resolves dynamic file names and removes Windows-invalid characters', () => {
    expect(resolveFileNamePattern('{{InvoiceNo}}_{{Customer Name}}', source.records[0]!, 'Tax Invoice', 'INV/001')).toBe('INV-001_ABC Traders');
  });

  it('sanitizes empty and invalid filenames safely', () => {
    expect(sanitizeGeneratedFileName('A<B>:C/')).toBe('A-B--C-');
    expect(sanitizeGeneratedFileName('   ')).toBe('Document');
  });

  it('validates template/source/record and source compatibility before generation', () => {
    expect(validateGeneration({ template: null, source: null, record: null, format: undefined, fileName: '' }).length).toBe(5);
    expect(validateGeneration({ template: { name: 'Invoice', sourceIds: ['other'], parentKeysBySource: {} }, source, record: source.records[0]!, format: 'pdf', fileName: 'Invoice' })).toContain('Selected data source is not used by the saved template.');
  });
});
