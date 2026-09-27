import { describe, expect, it } from 'vitest';
import type { BuilderDataSource } from './dataSourceStore.ts';
import {
  documentPreviewOptions,
  groupedDocumentRecords,
  resolveDocumentIdentityKeys,
  resolveTemplateDataSource,
} from './templateDataConfiguration.ts';

const source: BuilderDataSource = {
  id: 'import-1',
  name: 'Invoices.csv',
  sourceType: 'csv',
  importedAt: '2026-09-27T00:00:00Z',
  warnings: [],
  fields: [
    { name: 'invoiceNo', label: 'Invoice Number' },
    { name: 'amount', label: 'Amount' },
  ],
  records: [
    { invoiceNo: 'INV-001', amount: 10 },
    { invoiceNo: 'INV-001', amount: 20 },
    { invoiceNo: 'INV-002', amount: 99 },
    { invoiceNo: '', amount: 1000 },
  ],
};

describe('template-level document data configuration', () => {
  it('uses the chosen template column even when no dynamic table exists', () => {
    const keys = resolveDocumentIdentityKeys({ sourceId: source.id, documentIdField: 'invoiceNo' }, source, []);
    expect(keys).toEqual(['invoiceNo']);
    expect(documentPreviewOptions(source, keys)).toEqual([
      { value: 0, label: 'INV-001' },
      { value: 2, label: 'INV-002' },
    ]);
    expect(groupedDocumentRecords(source.records, source.records[0], keys)).toEqual(source.records.slice(0, 2));
  });

  it('keeps existing table Parent Key grouping for older templates', () => {
    const keys = resolveDocumentIdentityKeys(null, source, ['invoiceNo']);
    expect(keys).toEqual(['invoiceNo']);
  });

  it('does not silently use stale columns after source change', () => {
    expect(resolveDocumentIdentityKeys({ sourceId: source.id, documentIdField: 'missing' }, source, [])).toEqual([]);
  });

  it('does not aggregate all unrelated records for an invoice with blank ID', () => {
    const keys = ['invoiceNo'];
    expect(groupedDocumentRecords(source.records, source.records[3], keys)).toEqual([source.records[3]]);
  });

  it('recovers a reimported source by saved name without embedding records', () => {
    expect(resolveTemplateDataSource([source], { sourceId: 'old-import-id', sourceName: 'Invoices.csv', documentIdField: 'invoiceNo' })).toBe(source);
  });

  it('supports changing the document ID independently of table definitions', () => {
    expect(resolveDocumentIdentityKeys({ sourceId: source.id, documentIdField: 'amount' }, source, ['invoiceNo'])).toEqual(['amount']);
  });
});
