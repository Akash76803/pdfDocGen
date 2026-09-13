const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(value: number): string {
  if (value < 20) return ONES[value] ?? '';
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${TENS[tens]}${ones ? `-${ONES[ones]}` : ''}`;
}

function belowThousand(value: number): string {
  if (value <= 0) return '';
  if (value < 100) return belowHundred(value);
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  return `${ONES[hundreds]} Hundred${remainder ? ` ${belowHundred(remainder)}` : ''}`;
}

/**
 * Convert a non-negative integer to words using the Indian grouping system.
 * Supports values through Padma (10^15), which is far beyond normal invoice totals.
 */
export function integerToIndianWords(input: number): string {
  const value = Math.trunc(Math.abs(input));
  if (value === 0) return 'Zero';

  const scales = [
    { value: 1_000_000_000_000_000, label: 'Padma' },
    { value: 100_000_000_000_000, label: 'Neel' },
    { value: 10_000_000_000_000, label: 'Kharab' },
    { value: 1_000_000_000_000, label: 'Arab' },
    { value: 10_000_000, label: 'Crore' },
    { value: 100_000, label: 'Lakh' },
    { value: 1_000, label: 'Thousand' },
  ] as const;

  let remainder = value;
  const parts: string[] = [];
  for (const scale of scales) {
    if (remainder < scale.value) continue;
    const group = Math.floor(remainder / scale.value);
    // The larger Indian scales above Crore are intentionally recursive so values
    // such as 1,23,45,67,89,012 remain natural instead of collapsing to digits.
    const groupWords = group < 1000 ? belowThousand(group) : integerToIndianWords(group);
    if (groupWords) parts.push(`${groupWords} ${scale.label}`);
    remainder %= scale.value;
  }
  if (remainder > 0) parts.push(belowThousand(remainder));
  return parts.join(' ').trim();
}

/** Convert a numeric value to Indian Rupees / Paise words. */
export function amountToIndianWords(input: number): string {
  if (!Number.isFinite(input)) return '';
  const negative = input < 0;
  // Invoice amounts use two decimal places. Round first so 1.999 becomes 2.00.
  const roundedPaise = Math.round(Math.abs(input) * 100);
  const rupees = Math.floor(roundedPaise / 100);
  const paise = roundedPaise % 100;

  const rupeeWords = `${integerToIndianWords(rupees)} Rupee${rupees === 1 ? '' : 's'}`;
  const paiseWords = paise ? ` and ${integerToIndianWords(paise)} Paise` : '';
  return `${negative ? 'Minus ' : ''}${rupeeWords}${paiseWords} Only`;
}
