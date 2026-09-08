import type { InferredValue } from './types.js';
import type { ScalarFieldType } from '@document-tool/contracts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const DMY_OR_MDY = /^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/;
const NUMBER = /^-?(?:\d+|\d*\.\d+)$/;

export function inferCsvValue(input: unknown): InferredValue {
  if (input == null) return { value: null, type: 'null' };
  if (typeof input === 'boolean') return { value: input, type: 'boolean' };
  if (typeof input === 'number') return { value: input, type: 'number' };
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return { value: input, type: hasTime(input) ? 'datetime' : 'date' };
  }

  const raw = String(input);
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null, type: 'null' };

  if (/^(true|false)$/i.test(trimmed)) {
    return { value: trimmed.toLowerCase() === 'true', type: 'boolean' };
  }

  // Preserve identifiers such as 00123. Decimal values like 0.25 are safe.
  if (trimmed.length > 1 && /^0\d+/.test(trimmed) && !/^0\.\d+$/.test(trimmed)) {
    return { value: raw, type: 'string' };
  }

  if (NUMBER.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isFinite(num)) return { value: num, type: 'number' };
  }

  const dateType = detectDateLike(trimmed);
  if (dateType) return { value: trimmed, type: dateType };

  return { value: raw, type: 'string' };
}

export function inferExcelValue(input: unknown): InferredValue {
  if (input == null || input === '') return { value: null, type: 'null' };
  if (typeof input === 'boolean') return { value: input, type: 'boolean' };
  if (typeof input === 'number') return { value: input, type: 'number' };
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return { value: input, type: hasTime(input) ? 'datetime' : 'date' };
  }
  return { value: String(input), type: detectDateLike(String(input).trim()) ?? 'string' };
}

export function mergeFieldTypes(types: ScalarFieldType[]): ScalarFieldType {
  const nonNull = types.filter((type) => type !== 'null');
  if (nonNull.length === 0) return 'null';
  const unique = new Set(nonNull);
  if (unique.size === 1) return nonNull[0]!;
  if (unique.has('string')) return 'string';
  if (unique.has('datetime') && unique.has('date') && unique.size === 2) return 'datetime';
  return 'string';
}

function detectDateLike(value: string): 'date' | 'datetime' | null {
  if (ISO_DATETIME.test(value)) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : 'datetime';
  }

  if (ISO_DATE.test(value) || DMY_OR_MDY.test(value)) {
    const parts = value.includes('-') ? value.split('-') : value.split('/');
    if (ISO_DATE.test(value)) {
      const [year, month, day] = parts.map(Number);
      return isValidYmd(year!, month!, day!) ? 'date' : null;
    }

    const [first, second, year] = parts.map(Number);
    // Slash/dash dates are ambiguous; accept only values that are still structurally valid.
    const validDmy = isValidYmd(year!, second!, first!);
    const validMdy = isValidYmd(year!, first!, second!);
    return validDmy || validMdy ? 'date' : null;
  }

  return null;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function hasTime(value: Date): boolean {
  return value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0 || value.getMilliseconds() !== 0;
}
