import type { VisibilityCondition, VisibilityRule } from '@document-tool/contracts';
import { resolvePath } from './path-resolver.js';

export interface ConditionEvaluationContext {
  root: Record<string, unknown>;
}

export function isVisibilityCondition(rule: VisibilityRule): rule is VisibilityCondition {
  return 'path' in rule;
}

export function evaluateVisibilityRule(rule: VisibilityRule | undefined, root: Record<string, unknown>): boolean {
  if (!rule) return true;
  if (isVisibilityCondition(rule)) return evaluateCondition(rule, root);
  const results = (rule.conditions ?? []).map((child) => evaluateVisibilityRule(child, root));
  // Empty groups are intentionally visible: adding a rule container must not hide legacy content.
  const base = results.length === 0 ? true : rule.logic === 'ANY' ? results.some(Boolean) : results.every(Boolean);
  return rule.negate ? !base : base;
}

export function evaluateCondition(condition: VisibilityCondition, root: Record<string, unknown>): boolean {
  if (!condition.path) return true;
  const resolved = resolvePath(root, condition.path);
  const actual = resolved.found ? resolved.value : undefined;
  const operator = condition.operator;

  if (operator === 'IS_EMPTY') return isEmpty(actual);
  if (operator === 'NOT_EMPTY') return !isEmpty(actual);

  const normalizeText = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return condition.caseSensitive ? text : text.toLocaleLowerCase();
  };
  const expectedText = normalizeText(condition.value);
  const actualText = normalizeText(actual);

  if (operator === 'EQUALS') return scalarEquals(actual, condition.value, condition.caseSensitive);
  if (operator === 'NOT_EQUALS') return !scalarEquals(actual, condition.value, condition.caseSensitive);
  if (operator === 'IN') return (condition.values ?? []).some((candidate) => scalarEquals(actual, candidate, condition.caseSensitive));
  if (operator === 'CONTAINS') return actualText.includes(expectedText);
  if (operator === 'NOT_CONTAINS') return !actualText.includes(expectedText);
  if (operator === 'STARTS_WITH') return actualText.startsWith(expectedText);
  if (operator === 'ENDS_WITH') return actualText.endsWith(expectedText);

  const left = comparableScalar(actual);
  const right = comparableScalar(condition.value);
  if (left == null || right == null) return false;
  if (operator === 'GREATER_THAN') return left > right;
  if (operator === 'GREATER_OR_EQUAL') return left >= right;
  if (operator === 'LESS_THAN') return left < right;
  if (operator === 'LESS_OR_EQUAL') return left <= right;
  return true;
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function scalarEquals(actual: unknown, expected: unknown, caseSensitive = false): boolean {
  if (typeof actual === 'number' && typeof expected === 'number') return Object.is(actual, expected);
  if (typeof actual === 'boolean' || typeof expected === 'boolean') return String(actual).toLowerCase() === String(expected).toLowerCase();
  const left = actual == null ? '' : String(actual);
  const right = expected == null ? '' : String(expected);
  return caseSensitive ? left === right : left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

function comparableScalar(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) { const time=value.getTime(); return Number.isFinite(time)?time:null; }
  if (typeof value === 'string') {
    const text=value.trim();
    if (!text) return null;
    const numeric=Number(text);
    if (Number.isFinite(numeric)) return numeric;
    // Only treat ISO-like values as dates; arbitrary text must not silently become a date.
    if (/^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+-Z]*)?$/.test(text)) {
      const time=Date.parse(text);
      return Number.isFinite(time)?time:null;
    }
  }
  return null;
}
