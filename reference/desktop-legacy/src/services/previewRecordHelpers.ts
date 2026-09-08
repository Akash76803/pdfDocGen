import type { DesignDataContext } from '@document-tool/contracts';

/** Clamp a preview index to valid range. Returns 0 if rows is empty. */
export function clampPreviewRecordIndex(index: number, rowCount: number): number {
  if (rowCount <= 0) return 0;
  return Math.max(0, Math.min(rowCount - 1, index));
}

/**
 * Get the current preview record from a rows array.
 * Returns an empty record if rows is empty or index is out of range.
 */
export function getPreviewRecord(rows: Record<string, unknown>[], index: number): Record<string, unknown> {
  if (!rows.length) return {};
  const clamped = clampPreviewRecordIndex(index, rows.length);
  return rows[clamped] ?? {};
}

/**
 * Create a canonical DesignDataContext from a datasource record.
 * Merges only the record; all other context fields are preserved.
 */
export function createRecordDesignDataContext(record: Record<string, unknown>): DesignDataContext {
  return { record };
}

/**
 * Determine a human-readable label for a record (used in UI display).
 * Looks for common ID-like fields; falls back to "Record {index+1}".
 */
const LABEL_FIELDS = ['id', 'Id', 'ID', 'name', 'Name', 'employee_id', 'EmployeeId', 'email', 'Email', 'title', 'Title'];

export function getRecordDisplayLabel(record: Record<string, unknown>, index: number): string {
  for (const field of LABEL_FIELDS) {
    const value = record[field];
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      const str = String(value).trim();
      // Keep it short for UI
      return str.length > 32 ? str.slice(0, 29) + '…' : str;
    }
  }
  return `Record ${index + 1}`;
}

/**
 * Sanitize a filename segment derived from a datasource field value.
 * Strips filesystem-invalid characters; prevents path traversal.
 */
export function sanitizeFilenameSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '_')  // Windows-invalid chars
    .replace(/\.{2,}/g, '_')        // path traversal dots
    .replace(/^\.+|\.+$/g, '')      // leading/trailing dots
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64) // max segment length
    || 'unnamed';
}

/**
 * Expand a filename template with record values, artboard name, and recordIndex.
 * Supported tokens: {{recordIndex}}, {{artboardName}}, {{FieldName}}
 * Missing fields fall back to "record-{N}" pattern.
 */
export function expandFilenameTemplate(
  template: string,
  record: Record<string, unknown>,
  recordIndex: number,
  artboardName: string,
  fallbackLabel?: string
): string {
  const base = template
    .replace(/\{\{recordIndex\}\}/g, String(recordIndex + 1).padStart(3, '0'))
    .replace(/\{\{artboardName\}\}/g, sanitizeFilenameSegment(artboardName))
    .replace(/\{\{(\w+)\}\}/g, (_match, field: string) => {
      const val = record[field];
      if (val === null || val === undefined || String(val).trim() === '') {
        return fallbackLabel ? sanitizeFilenameSegment(fallbackLabel) : `record-${recordIndex + 1}`;
      }
      return sanitizeFilenameSegment(String(val));
    });
  return sanitizeFilenameSegment(base);
}

/**
 * Make filenames unique by appending a numeric suffix on collision.
 */
export function deduplicateFilename(filename: string, usedSet: Set<string>): string {
  if (!usedSet.has(filename)) {
    usedSet.add(filename);
    return filename;
  }
  let counter = 2;
  const dotIdx = filename.lastIndexOf('.');
  const base = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;
  const ext = dotIdx >= 0 ? filename.slice(dotIdx) : '';
  while (true) {
    const candidate = `${base}-${counter}${ext}`;
    if (!usedSet.has(candidate)) {
      usedSet.add(candidate);
      return candidate;
    }
    counter++;
  }
}
