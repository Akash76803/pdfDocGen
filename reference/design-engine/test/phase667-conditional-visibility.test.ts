import { describe, it, expect } from 'vitest';
import { evaluateElementVisibility } from '../src/bindings/visibility';
import { DesignDataContext, ElementVisibilityRule } from '@document-tool/contracts';

describe('Phase 6.6.7 - Conditional Visibility Evaluator', () => {
  const context: DesignDataContext = {
    record: {
      status: 'active',
      count: 5,
      isPremium: true,
      signupDate: '2024-01-01',
      emptyField: '',
      nullField: null,
    },
  };

  const evalRule = (rule: Partial<ElementVisibilityRule>) => evaluateElementVisibility(
    { enabled: true, id: '1', fieldPath: 'status', operator: 'EQUALS', ...rule },
    context
  );

  it('should return visible if rule is undefined', () => {
    expect(evaluateElementVisibility(undefined, context)).toBe(true);
  });

  it('should return visible if rule is disabled', () => {
    expect(evaluateElementVisibility({ enabled: false, id: '1', fieldPath: 'status', operator: 'EQUALS', value: 'inactive' }, context)).toBe(true);
  });

  it('should handle EQUALS operator', () => {
    expect(evalRule({ fieldPath: 'status', operator: 'EQUALS', value: 'active' })).toBe(true);
    expect(evalRule({ fieldPath: 'status', operator: 'EQUALS', value: 'inactive' })).toBe(false);
  });

  it('should handle NOT_EQUALS operator', () => {
    expect(evalRule({ fieldPath: 'status', operator: 'NOT_EQUALS', value: 'inactive' })).toBe(true);
    expect(evalRule({ fieldPath: 'status', operator: 'NOT_EQUALS', value: 'active' })).toBe(false);
  });

  it('should handle GREATER_THAN / LESS_THAN operators', () => {
    expect(evalRule({ fieldPath: 'count', operator: 'GREATER_THAN', value: 3 })).toBe(true);
    expect(evalRule({ fieldPath: 'count', operator: 'GREATER_THAN', value: 10 })).toBe(false);
    expect(evalRule({ fieldPath: 'count', operator: 'LESS_THAN', value: 10 })).toBe(true);
  });

  it('should handle CONTAINS operator (case-insensitive)', () => {
    expect(evalRule({ fieldPath: 'status', operator: 'CONTAINS', value: 'ACT' })).toBe(true);
    expect(evalRule({ fieldPath: 'status', operator: 'CONTAINS', value: 'xyz' })).toBe(false);
  });

  it('should handle IS_EMPTY and IS_NOT_EMPTY operators', () => {
    expect(evalRule({ fieldPath: 'emptyField', operator: 'IS_EMPTY' })).toBe(true);
    expect(evalRule({ fieldPath: 'status', operator: 'IS_EMPTY' })).toBe(false);

    expect(evalRule({ fieldPath: 'nullField', operator: 'IS_EMPTY' })).toBe(true);
    expect(evalRule({ fieldPath: 'status', operator: 'IS_NOT_EMPTY' })).toBe(true);
  });

  it('should safely default to false if field is missing for comparisons', () => {
    expect(evalRule({ fieldPath: 'missingField', operator: 'EQUALS', value: 'test' })).toBe(false);
    expect(evalRule({ fieldPath: 'missingField', operator: 'IS_EMPTY' })).toBe(true);
  });

  it('should parse and compare dates safely', () => {
    expect(evalRule({ fieldPath: 'signupDate', operator: 'BEFORE', value: '2024-12-31' })).toBe(true);
    expect(evalRule({ fieldPath: 'signupDate', operator: 'AFTER', value: '2025-01-01' })).toBe(false);
    // Invalid date fallback check
    expect(evalRule({ fieldPath: 'signupDate', operator: 'AFTER', value: 'invalid-date' })).toBe(false);
  });
});
