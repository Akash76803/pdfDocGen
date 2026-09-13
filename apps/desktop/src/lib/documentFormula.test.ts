import { describe, expect, it } from 'vitest';
import { evaluateDocumentFormulas, formatDocumentFormulaValue, validateDocumentFormula, type DocumentFormulaDefinition } from './documentFormula.ts';

const fields = [{ name: 'Taxable' }, { name: 'CGST' }, { name: 'SGST' }, { name: 'PaidAmount' }];
const rows = [
  { Taxable: 100, CGST: 9, SGST: 9, PaidAmount: 50 },
  { Taxable: 50, CGST: 4.5, SGST: 4.5, PaidAmount: 0 },
];

it('evaluates parent-document aggregates and chained formulas', () => {
  const formulas: DocumentFormulaDefinition[] = [
    { id: 'taxable', name: 'TaxableTotal', expression: 'SUM([Taxable])', format: 'decimal', precision: 2 },
    { id: 'gst', name: 'TotalGST', expression: 'SUM([CGST]) + SUM([SGST])', format: 'decimal', precision: 2 },
    { id: 'grand', name: 'GrandTotal', expression: '[TaxableTotal] + [TotalGST]', format: 'currency', precision: 2, currency: 'INR' },
    { id: 'balance', name: 'Balance', expression: '[GrandTotal] - [PaidAmount]', format: 'decimal', precision: 2 },
  ];
  const result = evaluateDocumentFormulas(formulas, rows[0], rows, fields);
  expect(result.values.TaxableTotal).toBe(150);
  expect(result.values.TotalGST).toBe(27);
  expect(result.values.GrandTotal).toBe(177);
  expect(result.values.Balance).toBe(127);
});

it('detects circular references without crashing', () => {
  const formulas: DocumentFormulaDefinition[] = [
    { id: 'a', name: 'A', expression: '[B] + 1', format: 'number', precision: 0 },
    { id: 'b', name: 'B', expression: '[A] + 1', format: 'number', precision: 0 },
  ];
  const result = evaluateDocumentFormulas(formulas, rows[0], rows, fields);
  expect(result.values.A).toBeUndefined();
  expect(result.errors.get('a')).toContain('Circular');
});

it('validates syntax and formats currency', () => {
  expect(validateDocumentFormula('ROUND([Taxable] * 0.18, 2)')).toBeNull();
  expect(validateDocumentFormula('[Taxable] +')).toBeTruthy();
  const formula: DocumentFormulaDefinition = { id: 'x', name: 'X', expression: '0', format: 'currency', precision: 2, currency: 'INR' };
  expect(formatDocumentFormulaValue(177, formula)).toContain('177.00');
});
