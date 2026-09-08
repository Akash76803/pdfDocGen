import type { FieldDefinition } from '@document-tool/contracts';

export function filterAvailableFields(fields: FieldDefinition[], query: string): FieldDefinition[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return fields;

  return fields.filter(f => {
    const label = (f.label || '').toLowerCase();
    const name = (f.name || '').toLowerCase();
    return label.includes(trimmed) || name.includes(trimmed);
  });
}
