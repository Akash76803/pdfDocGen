import type { ConditionOperator, VisibilityRule } from '@document-tool/contracts';

export type BuilderConditionAction = 'show' | 'hide';
export type BuilderConditionMatch = 'all' | 'any';
export type BuilderConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual';

export interface BuilderConditionRule {
  id: string;
  field: string;
  operator: BuilderConditionOperator;
  value?: string;
}

export interface BuilderConditionalRendering {
  enabled: boolean;
  action: BuilderConditionAction;
  match: BuilderConditionMatch;
  rules: BuilderConditionRule[];
}

export interface LegacyBuilderCondition {
  conditionEnabled?: boolean;
  conditionField?: string;
  conditionOperator?: BuilderConditionOperator;
  conditionValue?: string;
}

export const defaultConditionalRendering = (): BuilderConditionalRendering => ({
  enabled: false,
  action: 'show',
  match: 'all',
  rules: [],
});

export function normalizeConditionalRendering(
  current: BuilderConditionalRendering | undefined,
  legacy?: LegacyBuilderCondition,
): BuilderConditionalRendering {
  if (current) {
    return {
      enabled: Boolean(current.enabled),
      action: current.action === 'hide' ? 'hide' : 'show',
      match: current.match === 'any' ? 'any' : 'all',
      rules: (current.rules ?? []).map((rule, index) => ({
        id: rule.id || `condition-${index + 1}`,
        field: rule.field ?? '',
        operator: rule.operator ?? 'equals',
        value: rule.value ?? '',
      })),
    };
  }
  if (!legacy?.conditionEnabled && !legacy?.conditionField) return defaultConditionalRendering();
  return {
    enabled: Boolean(legacy.conditionEnabled),
    action: 'show',
    match: 'all',
    rules: [{
      id: 'legacy-condition-1',
      field: legacy.conditionField ?? '',
      operator: legacy.conditionOperator ?? 'equals',
      value: legacy.conditionValue ?? '',
    }],
  };
}

export function evaluateBuilderConditionalRendering(
  condition: BuilderConditionalRendering | undefined,
  resolveField: (field: string) => unknown,
): boolean {
  const normalized = normalizeConditionalRendering(condition);
  if (!normalized.enabled) return true;
  const usableRules = normalized.rules.filter((rule) => rule.field.trim());
  if (usableRules.length === 0) return true;
  const results = usableRules.map((rule) => evaluateBuilderConditionRule(rule, resolveField(rule.field)));
  const matched = normalized.match === 'any' ? results.some(Boolean) : results.every(Boolean);
  return normalized.action === 'hide' ? !matched : matched;
}

export function evaluateBuilderConditionRule(rule: BuilderConditionRule, actual: unknown): boolean {
  const expected = rule.value ?? '';
  if (rule.operator === 'isEmpty') return isEmpty(actual);
  if (rule.operator === 'isNotEmpty') return !isEmpty(actual);

  const actualText = normalizedText(actual);
  const expectedText = normalizedText(expected);
  if (rule.operator === 'equals') return scalarEquals(actual, expected);
  if (rule.operator === 'notEquals') return !scalarEquals(actual, expected);
  if (rule.operator === 'contains') return actualText.includes(expectedText);
  if (rule.operator === 'notContains') return !actualText.includes(expectedText);
  if (rule.operator === 'startsWith') return actualText.startsWith(expectedText);
  if (rule.operator === 'endsWith') return actualText.endsWith(expectedText);

  const left = comparableScalar(actual);
  const right = comparableScalar(expected);
  if (left == null || right == null) return false;
  if (rule.operator === 'greaterThan') return left > right;
  if (rule.operator === 'greaterThanOrEqual') return left >= right;
  if (rule.operator === 'lessThan') return left < right;
  if (rule.operator === 'lessThanOrEqual') return left <= right;
  return true;
}

const operatorMap: Record<BuilderConditionOperator, ConditionOperator> = {
  equals: 'EQUALS',
  notEquals: 'NOT_EQUALS',
  contains: 'CONTAINS',
  notContains: 'NOT_CONTAINS',
  startsWith: 'STARTS_WITH',
  endsWith: 'ENDS_WITH',
  isEmpty: 'IS_EMPTY',
  isNotEmpty: 'NOT_EMPTY',
  greaterThan: 'GREATER_THAN',
  greaterThanOrEqual: 'GREATER_OR_EQUAL',
  lessThan: 'LESS_THAN',
  lessThanOrEqual: 'LESS_OR_EQUAL',
};

export function toVisibilityRule(
  condition: BuilderConditionalRendering | undefined,
  normalizePath: (field: string) => string,
): VisibilityRule | undefined {
  const normalized = normalizeConditionalRendering(condition);
  if (!normalized.enabled) return undefined;
  const rules = normalized.rules
    .filter((rule) => rule.field.trim())
    .map((rule) => ({
      path: normalizePath(rule.field),
      operator: operatorMap[rule.operator],
      ...(requiresValue(rule.operator) ? { value: rule.value ?? '' } : {}),
    }))
    .filter((rule) => rule.path);
  if (!rules.length) return undefined;
  if (rules.length === 1 && normalized.action === 'show') return rules[0];
  return {
    logic: normalized.match === 'any' ? 'ANY' : 'ALL',
    conditions: rules,
    negate: normalized.action === 'hide',
  };
}

export const requiresValue = (operator: BuilderConditionOperator) =>
  operator !== 'isEmpty' && operator !== 'isNotEmpty';

function normalizedText(value: unknown): string {
  return value == null ? '' : String(value).trim().toLocaleLowerCase();
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function scalarEquals(actual: unknown, expected: unknown): boolean {
  if (typeof actual === 'number') {
    const expectedNumber = Number(expected);
    if (Number.isFinite(expectedNumber)) return Object.is(actual, expectedNumber);
  }
  if (typeof actual === 'boolean') return String(actual).toLowerCase() === String(expected).trim().toLowerCase();
  return normalizedText(actual) === normalizedText(expected);
}

function comparableScalar(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === 'string') {
    const text = value.trim().replace(/,/g, '');
    if (!text) return null;
    const numeric = Number(text);
    if (Number.isFinite(numeric)) return numeric;
    if (/^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+\-Z]*)?$/.test(text)) {
      const time = Date.parse(text);
      return Number.isFinite(time) ? time : null;
    }
  }
  return null;
}
