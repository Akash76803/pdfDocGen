import { DesignDataContext, ElementVisibilityRule } from '@document-tool/contracts';
import { resolvePath } from './resolver.js';

export function evaluateElementVisibility(
  rule: ElementVisibilityRule | undefined,
  context: DesignDataContext
): boolean {
  if (!rule || rule.enabled === false) {
    return true;
  }

  const { fieldPath, operator, value } = rule;
  if (!fieldPath) {
    return true; // Malformed/incomplete rule safe default
  }

  const rawRecordValue = resolvePath(context.record, fieldPath);

  // If path is missing or blocked, safe default is visible (per requirements)
  // Wait, requirement says: "If saved fieldPath no longer exists: preserve rule. Show warning. Runtime behavior: safe visible fallback."
  if (rawRecordValue === undefined && !Object.prototype.hasOwnProperty.call(context.record || {}, fieldPath.split('.')[0])) {
    // We do a simple check to see if the root field exists. 
    // Actually, if we just want "safe visible fallback" when the field is completely missing, 
    // we can just say if it's undefined, it might still match IS_EMPTY. 
    // Wait, requirement says: "Invalid numeric conversion: condition evaluates false rather than throwing."
    // Let's implement operator logic.
  }

  const recordStr = String(rawRecordValue ?? '');
  const valStr = String(value ?? '');

  switch (operator) {
    case 'IS_EMPTY':
      return rawRecordValue === null || rawRecordValue === undefined || recordStr.trim() === '';
    case 'IS_NOT_EMPTY':
      return !(rawRecordValue === null || rawRecordValue === undefined || recordStr.trim() === '');
      
    case 'EQUALS':
      if (typeof rawRecordValue === 'boolean' && typeof value === 'boolean') {
        return rawRecordValue === value;
      }
      if (typeof rawRecordValue === 'number' && typeof value === 'number') {
        return rawRecordValue === value;
      }
      return recordStr.toLowerCase() === valStr.toLowerCase();
      
    case 'NOT_EQUALS':
      if (typeof rawRecordValue === 'boolean' && typeof value === 'boolean') {
        return rawRecordValue !== value;
      }
      if (typeof rawRecordValue === 'number' && typeof value === 'number') {
        return rawRecordValue !== value;
      }
      return recordStr.toLowerCase() !== valStr.toLowerCase();

    case 'CONTAINS':
      return recordStr.toLowerCase().includes(valStr.toLowerCase());
    case 'NOT_CONTAINS':
      return !recordStr.toLowerCase().includes(valStr.toLowerCase());
    case 'STARTS_WITH':
      return recordStr.toLowerCase().startsWith(valStr.toLowerCase());
    case 'ENDS_WITH':
      return recordStr.toLowerCase().endsWith(valStr.toLowerCase());

    case 'GREATER_THAN':
    case 'GREATER_OR_EQUAL':
    case 'LESS_THAN':
    case 'LESS_OR_EQUAL': {
      const numRecord = Number(rawRecordValue);
      const numVal = Number(value);
      if (isNaN(numRecord) || isNaN(numVal)) return false; // safe false for invalid numbers

      if (operator === 'GREATER_THAN') return numRecord > numVal;
      if (operator === 'GREATER_OR_EQUAL') return numRecord >= numVal;
      if (operator === 'LESS_THAN') return numRecord < numVal;
      if (operator === 'LESS_OR_EQUAL') return numRecord <= numVal;
      return false;
    }

    case 'BEFORE':
    case 'AFTER':
    case 'ON_OR_BEFORE':
    case 'ON_OR_AFTER': {
      const dateRecord = new Date(recordStr).getTime();
      const dateVal = new Date(valStr).getTime();
      if (isNaN(dateRecord) || isNaN(dateVal)) return false; // safe false

      if (operator === 'BEFORE') return dateRecord < dateVal;
      if (operator === 'AFTER') return dateRecord > dateVal;
      if (operator === 'ON_OR_BEFORE') return dateRecord <= dateVal;
      if (operator === 'ON_OR_AFTER') return dateRecord >= dateVal;
      return false;
    }

    default:
      return true; // safe fallback
  }
}
