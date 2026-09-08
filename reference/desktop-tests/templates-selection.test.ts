import { describe, expect, it } from 'vitest';
import type { DocumentGroup } from '@document-tool/contracts';
import { retainAvailableGroupIds, selectDefaultCollectionPath } from '../src/utils/groupSelection.js';

const group = (id: string): DocumentGroup => ({
  id,
  key:id,
  header:{},
  items:[],
  sourceItems:[],
  itemDetails:[],
  sourceRowIndexes:[],
  warnings:[],
  valid:true,
});

describe('Templates group selection pruning', () => {
  it('preserves the current array reference when the selection is unchanged', () => {
    const current = ['a', 'b'];
    expect(retainAvailableGroupIds(current, [group('a'), group('b')])).toBe(current);
    const empty: string[] = [];
    expect(retainAvailableGroupIds(empty, [])).toBe(empty);
  });

  it('removes unavailable IDs while preserving selected order', () => {
    const current = ['b', 'missing', 'a'];
    expect(retainAvailableGroupIds(current, [group('a'), group('b')])).toEqual(['b', 'a']);
  });

  it('prefers the canonical items collection for a new Data View', () => {
    expect(selectDefaultCollectionPath([{path:'fields'},{path:'items'},{path:'sourceItems'}])).toBe('items');
    expect(selectDefaultCollectionPath([{path:'fields'},{path:'sourceItems'}])).toBe('sourceItems');
    expect(selectDefaultCollectionPath([{path:'fields'}])).toBe('fields');
    expect(selectDefaultCollectionPath([])).toBe('items');
  });
});
