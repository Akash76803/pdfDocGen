import { describe, expect, it } from 'vitest';
import {
  evaluateBuilderConditionalRendering,
  filterConditionallyVisible,
  normalizeConditionalRendering,
  toVisibilityRule,
  type BuilderConditionalRendering,
} from './conditionalRendering.ts';

describe('UX-8 universal builder conditional rendering', () => {
  it('migrates a legacy single rule without changing default show semantics', () => {
    const migrated = normalizeConditionalRendering(undefined, {
      conditionEnabled: true,
      conditionField: 'Status',
      conditionOperator: 'equals',
      conditionValue: 'Approved',
    });
    expect(migrated).toMatchObject({
      enabled: true,
      action: 'show',
      match: 'all',
      rules: [{ field: 'Status', operator: 'equals', value: 'Approved' }],
    });
  });

  it('supports ALL and ANY groups', () => {
    const all: BuilderConditionalRendering = {
      enabled: true,
      action: 'show',
      match: 'all',
      rules: [
        { id: '1', field: 'Status', operator: 'equals', value: 'Approved' },
        { id: '2', field: 'Amount', operator: 'greaterThan', value: '10000' },
      ],
    };
    const data: Record<string, unknown> = { Status: 'approved', Amount: 12000 };
    expect(evaluateBuilderConditionalRendering(all, (field) => data[field])).toBe(true);
    expect(evaluateBuilderConditionalRendering({ ...all, match: 'any', rules: [
      { id: '1', field: 'Status', operator: 'equals', value: 'Draft' },
      { id: '2', field: 'Amount', operator: 'greaterThan', value: '10000' },
    ]}, (field) => data[field])).toBe(true);
  });

  it('supports hide-when-matched and empty values', () => {
    const condition: BuilderConditionalRendering = {
      enabled: true,
      action: 'hide',
      match: 'all',
      rules: [{ id: '1', field: 'GSTIN', operator: 'isEmpty' }],
    };
    expect(evaluateBuilderConditionalRendering(condition, () => '   ')).toBe(false);
    expect(evaluateBuilderConditionalRendering(condition, () => '27ABCDE1234F1Z5')).toBe(true);
  });

  it('supports numeric/date comparisons plus starts/ends with', () => {
    const values: Record<string, unknown> = {
      Amount: '12,500',
      Date: '2026-09-19',
      Code: 'INV-2026-FINAL',
    };
    const condition: BuilderConditionalRendering = {
      enabled: true,
      action: 'show',
      match: 'all',
      rules: [
        { id: '1', field: 'Amount', operator: 'greaterThanOrEqual', value: '10000' },
        { id: '2', field: 'Date', operator: 'lessThanOrEqual', value: '2026-09-19' },
        { id: '3', field: 'Code', operator: 'startsWith', value: 'inv-' },
        { id: '4', field: 'Code', operator: 'endsWith', value: 'final' },
      ],
    };
    expect(evaluateBuilderConditionalRendering(condition, (field) => values[field])).toBe(true);
  });

  it('maps builder rules to renderer VisibilityRule including hide/ANY', () => {
    const rule = toVisibilityRule({
      enabled: true,
      action: 'hide',
      match: 'any',
      rules: [
        { id: '1', field: 'Status', operator: 'equals', value: 'Cancelled' },
        { id: '2', field: 'Balance', operator: 'lessThanOrEqual', value: '0' },
      ],
    }, (field) => field.toLowerCase());
    expect(rule).toEqual({
      logic: 'ANY',
      negate: true,
      conditions: [
        { path: 'status', operator: 'EQUALS', value: 'Cancelled' },
        { path: 'balance', operator: 'LESS_OR_EQUAL', value: '0' },
      ],
    });
  });
});


describe('UX-8.2 pre-layout filtering', () => {
  it('removes hidden flow inputs before layout/pagination while preserving visible order', () => {
    const data: Record<string, unknown> = { showB: false, status: 'Approved' };
    const items = [
      { id:'a' },
      { id:'b', conditionalRendering:{ enabled:true, action:'show' as const, match:'all' as const, rules:[{ id:'r1', field:'showB', operator:'equals' as const, value:'true' }] } },
      { id:'c', conditionalRendering:{ enabled:true, action:'show' as const, match:'all' as const, rules:[{ id:'r2', field:'status', operator:'equals' as const, value:'Approved' }] } },
    ];
    expect(filterConditionallyVisible(items, (field) => data[field]).map((item) => item.id)).toEqual(['a','c']);
  });
});
