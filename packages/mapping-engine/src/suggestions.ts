import type { FieldRole, SummaryAggregation } from '@document-tool/contracts';

export interface MappingSuggestion {
  path: string;
  role: FieldRole;
  summaryAggregation?: SummaryAggregation;
}

function normalizeWord(word: string): string {
  if (/^[A-Z0-9]+$/.test(word)) {
    return word.toLowerCase();
  }
  return word.charAt(0).toLowerCase() + word.slice(1);
}

export function sanitizeTargetSegment(value: string): string {
  const words = value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'field';

  const [first, ...rest] = words;
  const normalizedFirst = normalizeWord(first ?? 'field').replace(/^[^A-Za-z_]+/, '');
  const camel = normalizedFirst + rest
    .map((word) => {
      const normalized = normalizeWord(word);
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join('');

  const clean = camel.replace(/[^A-Za-z0-9_]/g, '');
  if (!clean) return 'field';
  return /^[A-Za-z_]/.test(clean) ? clean : `field${clean}`;
}

export function suggestMapping(name: string, groupAlready = false): MappingSuggestion {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (!groupAlready && ['invoiceno', 'invoicenumber', 'invoiceid', 'orderno', 'ordernumber'].includes(key)) {
    return {
      path: key.startsWith('order') ? 'order.number' : 'invoice.number',
      role: 'GROUP_KEY'
    };
  }

  if (['invoicedate', 'date'].includes(key)) return { path: 'invoice.date', role: 'HEADER_FIELD' };
  if (['customer', 'customername', 'partyname'].includes(key)) return { path: 'customer.name', role: 'HEADER_FIELD' };
  if (['gstin', 'customergstin'].includes(key)) return { path: 'customer.gstin', role: 'HEADER_FIELD' };
  if (['product', 'productname', 'item', 'itemname'].includes(key)) return { path: 'items.product', role: 'LINE_ITEM_FIELD' };
  if (['qty', 'quantity'].includes(key)) return { path: 'items.qty', role: 'LINE_ITEM_FIELD' };
  if (['rate', 'price'].includes(key)) return { path: 'items.rate', role: 'LINE_ITEM_FIELD' };
  if (['amount', 'lineamount'].includes(key)) return { path: 'items.amount', role: 'LINE_ITEM_FIELD' };
  if (/(taxable|discount|sgst|cgst|igst|taxamount|finalamount|netamount|roundoff|freight|tcs|scheme)/.test(key)) return { path: `items.${sanitizeTargetSegment(name)}`, role: 'SUMMARY_FIELD', summaryAggregation: 'SUM' };

  return { path: `fields.${sanitizeTargetSegment(name)}`, role: 'HEADER_FIELD' };
}
