import { describe, expect, it } from 'vitest';
import type { DocumentGroup } from '@document-tool/contracts';
import { discoverFieldPaths } from '../src/field-discovery.js';

const group: DocumentGroup = {
  id: 'g',
  key: '1',
  header: {
    invoice: { number: 'I1' },
    customer: { name: 'ABC' }
  },
  items: [
    { product: 'A', qty: 1 },
    { product: 'B', qty: 2 }
  ],
  itemDetails: [],
  sourceRowIndexes: [1, 2],
  warnings: [],
  valid: true
};

describe('field discovery', () => {
  it('discovers nested scalar and collection fields without duplicates', () => {
    const result = discoverFieldPaths(group);

    expect(result.scalarFields).toContain('invoice.number');
    expect(result.scalarFields).toContain('customer.name');

    const items = result.collections.find((collection) => collection.path === 'items');
    expect(items?.fields).toContain('items.product');

    const itemFields = items?.fields ?? [];
    expect(new Set(itemFields).size).toBe(itemFields.length);
  });

  it('respects max depth', () => {
    const deepGroup: DocumentGroup = {
      ...group,
      header: {
        a: {
          b: {
            c: {
              d: 1
            }
          }
        }
      }
    };

    expect(discoverFieldPaths(deepGroup, 2).scalarFields).not.toContain('a.b.c.d');
  });
});
