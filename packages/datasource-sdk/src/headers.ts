import type { HeaderProcessingResult, ProcessedHeader } from './types.js';
import type { DataWarning } from '@document-tool/contracts';

export function processHeaders(rawHeaders: unknown[]): HeaderProcessingResult {
  const seen = new Map<string, number>();
  const warnings: DataWarning[] = [];
  const headers: ProcessedHeader[] = rawHeaders.map((raw, index) => {
    const originalLabel = raw == null ? '' : String(raw);
    const label = originalLabel.trim();
    const base = label || `Column_${index + 1}`;

    if (!label) {
      warnings.push({
        code: 'BLANK_HEADER',
        message: `Column ${index + 1} has a blank header and was renamed to ${base}.`,
        columnIndex: index,
      });
    }

    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const key = count === 1 ? base : `${base}_${count}`;

    if (count > 1) {
      warnings.push({
        code: 'DUPLICATE_HEADER',
        message: `Duplicate header "${base}" was renamed to "${key}".`,
        columnIndex: index,
      });
    }

    return { key, label: label || base, originalLabel, columnIndex: index };
  });

  return { headers, warnings };
}
