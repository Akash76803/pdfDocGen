export type TemplateTokenField = { name: string; label?: string };

export function cleanTemplateTokenName(value: string | undefined | null) {
  return (value ?? '').trim().replace(/^\{+/, '').replace(/\}+$/, '').trim();
}

export function matchTemplateTokenField(fields: TemplateTokenField[], token: string) {
  const cleaned = cleanTemplateTokenName(token);
  if (!cleaned) return undefined;
  const lowered = cleaned.toLocaleLowerCase();
  return fields.find((field) => {
    const name = cleanTemplateTokenName(field.name);
    const label = cleanTemplateTokenName(field.label);
    return name === cleaned || label === cleaned || name.toLocaleLowerCase() === lowered || label.toLocaleLowerCase() === lowered;
  });
}

export function templateHasTokens(value: string | undefined | null) {
  return /\{\{\s*[^{}]+?\s*\}\}/.test(value ?? '');
}

export function resolveTemplateTokens(
  template: string | undefined | null,
  resolveField: (field: string) => unknown,
  options?: { pageNumber?: number; totalPages?: number; preserveUnknown?: boolean },
) {
  // Be forgiving of imported field names that already contain braces. Earlier builds
  // could create {{{Field}}}; normalize that to the canonical {{Field}} form.
  const source = (template ?? '').replace(/\{\{\{+\s*([^{}]+?)\s*\}\}\}+/g, '{{$1}}');
  return source.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, rawToken: string) => {
    const token = rawToken.trim();
    if (/^pageNumber$/i.test(token)) return String(options?.pageNumber ?? 1);
    if (/^totalPages$/i.test(token)) return String(options?.totalPages ?? 1);
    const value = resolveField(token);
    if (value === undefined || value === null) return options?.preserveUnknown ? match : '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      try { return JSON.stringify(value); } catch { return String(value); }
    }
    return String(value);
  });
}

export function tokenForField(field: string) {
  return `{{${cleanTemplateTokenName(field)}}}`;
}
