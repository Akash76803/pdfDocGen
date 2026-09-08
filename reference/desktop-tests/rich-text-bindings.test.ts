import { describe, expect, it } from 'vitest';
import { groupRichTextBindings } from '../src/utils/richTextBindings.js';

describe('Phase 4.14 rich-text binding groups', () => {
  it('exposes calculated fields separately without hiding normal fields', () => {
    const groups = groupRichTextBindings([
      { value: 'customer.name', label: 'Customer Name' },
      { value: 'calc.freightAmount', label: 'Calculated · Freight Amount' },
      { value: 'items.qty', label: 'Quantity' },
      { value: 'calc.grandTotal', label: 'Calculated · Grand Total' },
    ]);
    expect(groups.calculated.map((item) => item.value)).toEqual(['calc.freightAmount', 'calc.grandTotal']);
    expect(groups.fields.map((item) => item.value)).toEqual(['customer.name', 'items.qty']);
  });

  it('keeps legacy field-only binding lists unchanged', () => {
    const options = [{ value: 'customer.name', label: 'Customer Name' }];
    const groups = groupRichTextBindings(options);
    expect(groups.calculated).toEqual([]);
    expect(groups.fields).toEqual(options);
  });
});
