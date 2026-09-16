const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);

function camelSegment(raw: string): string {
  const expanded = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/%/g, ' Percent ')
    .replace(/&/g, ' And ')
    .replace(/#/g, ' Number ');
  const words = expanded.match(/[A-Za-z0-9]+/g) ?? [];
  if (!words.length) return 'field';
  const first = words[0]!.toLowerCase();
  const rest = words.slice(1).map((word) => {
    const lower = word.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join('');
  let value = `${first}${rest}`;
  if (/^[0-9]/.test(value)) value = `field${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value) || BLOCKED.has(value)) value = `field${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  return value || 'field';
}

/**
 * Converts imported/business field labels into the stable safe paths accepted by
 * the headless template engine and REST API. Dot notation is preserved as nesting.
 * Examples:
 *   "Customer: Account Name" -> "customerAccountName"
 *   "GST %"                  -> "gstPercent"
 *   "items.Unit Price"       -> "items.unitPrice"
 */
export function toApiSafePath(path: string): string {
  const raw = path.trim();
  if (!raw) return '';
  return raw.split('.').map((segment) => camelSegment(segment)).join('.');
}
