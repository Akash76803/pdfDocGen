import type { DisplayFormatDefinition } from '@document-tool/contracts';

export type DisplayScalar = string | number | boolean | null;

export function formatDisplayValue(value: unknown, format?: DisplayFormatDefinition): DisplayScalar {
  const type = format?.type ?? 'RAW';
  if (value == null) return type === 'RAW' && !format?.nullDisplay ? null : (format?.nullDisplay ?? '');
  if (type === 'RAW' && !format?.prefix && !format?.suffix) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    return String(value);
  }
  const locale = format?.locale ?? 'en-IN';
  let rendered = '';
  if (type === 'BOOLEAN') {
    const bool = typeof value === 'boolean' ? value : ['true','1','yes','y'].includes(String(value).trim().toLowerCase());
    rendered = bool ? (format?.trueLabel ?? 'Yes') : (format?.falseLabel ?? 'No');
  } else if (type === 'DATE' || type === 'DATETIME') {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) rendered = String(value);
    else if ((format?.dateStyle ?? 'MEDIUM') === 'ISO') rendered = type === 'DATE' ? date.toISOString().slice(0,10) : date.toISOString();
    else {
      const style = (format?.dateStyle ?? 'MEDIUM').toLowerCase() as 'short'|'medium'|'long';
      rendered = new Intl.DateTimeFormat(locale, type === 'DATE' ? { dateStyle: style } : { dateStyle: style, timeStyle: style === 'long' ? 'medium' : 'short' }).format(date);
    }
  } else if (type === 'CUSTOM') {
    rendered = String(value);
    if (format?.customPattern) rendered = format.customPattern.replace(/\{value\}/g, rendered);
  } else {
    const num = typeof value === 'number' ? value : Number(String(value).replace(/,/g,'').trim());
    if (!Number.isFinite(num)) rendered = String(value);
    else {
      const decimals = Math.max(0, Math.min(8, format?.decimals ?? (type === 'INTEGER' || type === 'PERCENT' ? 0 : 2)));
      const options: Intl.NumberFormatOptions = { useGrouping: format?.useGrouping ?? true, minimumFractionDigits: type === 'INTEGER' ? 0 : decimals, maximumFractionDigits: type === 'INTEGER' ? 0 : decimals };
      let n = type === 'PERCENT' && (format?.percentInputMode ?? 'FRACTION') === 'FRACTION' ? num * 100 : type === 'INTEGER' ? Math.round(num) : num;
      const abs = format?.negativeFormat === 'PARENTHESES' ? Math.abs(n) : n;
      rendered = abs.toLocaleString(locale, options);
      if (type === 'PERCENT') rendered += '%';
      if (type === 'CURRENCY') rendered = `${format?.currencySymbol ?? currencySymbol(format?.currencyCode ?? 'INR')}${rendered}`;
      if (format?.negativeFormat === 'PARENTHESES' && n < 0) rendered = `(${rendered})`;
    }
  }
  return `${format?.prefix ?? ''}${rendered}${format?.suffix ?? ''}`;
}

export function displayString(value: unknown, format?: DisplayFormatDefinition): string {
  const rendered = formatDisplayValue(value, format);
  return rendered == null ? '' : String(rendered);
}

function currencySymbol(code: string): string {
  try { return new Intl.NumberFormat('en-IN', { style:'currency', currency:code, currencyDisplay:'narrowSymbol', maximumFractionDigits:0 }).formatToParts(0).find(p=>p.type==='currency')?.value ?? code; }
  catch { return code; }
}
