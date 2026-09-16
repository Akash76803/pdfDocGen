import {
  toApiSafePath,
  type DocumentGroup,
  type FormulaFieldBinding,
  type NormalizedRecord,
  type NormalizedValue,
  type TableBlock,
  type TableColumnDefinition,
  type TemplateDefinition,
} from '@document-tool/contracts';
import { evaluateFormula } from '@document-tool/template-engine';

type GroupedTableSpec = {
  tableId: string;
  sourcePath: string;
  groupBy: string[];
  columns: Array<{
    field?: string;
    operation: string;
    outputKey: string;
    label?: string;
    formula?: string;
  }>;
};

function normalizedRecord(value: unknown): NormalizedRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as NormalizedRecord) } : {};
}

function directPath(root: unknown, path: string): unknown {
  let cursor: unknown = root;
  for (const part of path.split('.').filter(Boolean)) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor) || !Object.prototype.hasOwnProperty.call(cursor, part)) return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function valueFor(root: NormalizedRecord, path: string): unknown {
  const raw = String(path ?? '').trim();
  if (!raw) return undefined;
  const direct = directPath(root, raw);
  if (direct !== undefined) return direct;
  const safe = toApiSafePath(raw);
  if (safe) {
    const safeDirect = directPath(root, safe);
    if (safeDirect !== undefined) return safeDirect;
  }
  const lower = raw.toLocaleLowerCase();
  const found = Object.keys(root).find((key) => key.toLocaleLowerCase() === lower || (safe && toApiSafePath(key) === safe));
  return found ? root[found] : undefined;
}

function setPath(target: NormalizedRecord, path: string | undefined, value: NormalizedValue) {
  const clean = String(path ?? '').trim();
  if (!clean) return;
  const parts = clean.split('.').filter(Boolean);
  if (!parts.length) return;
  let cursor: Record<string, NormalizedValue> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    const current = cursor[key];
    if (!current || typeof current !== 'object' || Array.isArray(current)) cursor[key] = {};
    cursor = cursor[key] as Record<string, NormalizedValue>;
  }
  cursor[parts[parts.length - 1]!] = value;
}

function formulaAliases(column: TableColumnDefinition): string[] {
  return [...new Set([
    column.path,
    column.targetPath,
    column.sourceField,
    toApiSafePath(column.label),
    column.label,
  ].filter((item): item is string => Boolean(item && item.trim())))];
}

function materializeTableFormulaRows(template: TemplateDefinition, group: DocumentGroup): DocumentGroup {
  const tables = (template.body?.blocks ?? []).filter((block): block is TableBlock => block.type === 'TABLE');
  const itemTables = tables.filter((table) => (table.sourcePath ?? 'items') === 'items' && table.columns.some((column) => (column.kind ?? 'SOURCE') === 'FORMULA'));
  if (!itemTables.length || !group.items.length) return group;

  const rows = group.items.map((input, rowIndex) => {
    const working = normalizedRecord(input);
    for (const table of itemTables) {
      const formulas = table.columns.filter((column) => (column.kind ?? 'SOURCE') === 'FORMULA');
      const unresolved = new Set(formulas.map((column) => column.id));
      const byId = new Map(formulas.map((column) => [column.id, column]));
      const aliasToId = new Map<string, string>();
      for (const column of formulas) for (const alias of formulaAliases(column)) aliasToId.set(alias, column.id);

      for (let pass = 0; pass < formulas.length && unresolved.size; pass += 1) {
        let progressed = false;
        for (const id of [...unresolved]) {
          const column = byId.get(id)!;
          const dependencies = (column.formulaBindings ?? []).flatMap((binding) => [binding.path, binding.targetPath, binding.sourceField]).filter(Boolean) as string[];
          const waiting = dependencies.some((dependency) => {
            const depId = aliasToId.get(dependency) ?? aliasToId.get(toApiSafePath(dependency));
            return depId && depId !== id && unresolved.has(depId);
          });
          if (waiting) continue;
          try {
            const raw = evaluateFormula(column.formulaExpression ?? '', column.formulaBindings ?? [], {
              rows: [working],
              rawRows: [group.sourceItems?.[rowIndex] ?? input],
              defaultSourcePath: 'items',
              root: { ...group.header, items: group.items },
            });
            for (const alias of formulaAliases(column)) setPath(working, alias, raw);
            unresolved.delete(id);
            progressed = true;
          } catch {
            // Keep it pending for another dependency pass. The TemplateEngine will
            // still report/blank an invalid expression later instead of this bridge
            // silently inventing a value.
          }
        }
        if (!progressed) break;
      }
    }
    return working;
  });

  return { ...group, items: rows };
}

function groupedSpecs(template: TemplateDefinition): GroupedTableSpec[] {
  const raw = template.metadata?.desktopGroupedTables;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is GroupedTableSpec => Boolean(
    value && typeof value === 'object' &&
    typeof (value as GroupedTableSpec).sourcePath === 'string' &&
    Array.isArray((value as GroupedTableSpec).groupBy) &&
    Array.isArray((value as GroupedTableSpec).columns),
  ));
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value == null || value === '') return null;
  const number = Number(String(value).replace(/,/g, '').replace(/[₹$€£%]/g, '').trim());
  return Number.isFinite(number) ? number : null;
}


function firstNumeric(row: NormalizedRecord, fields: string[]): number | null {
  for (const field of fields) {
    const value = numeric(valueFor(row, field));
    if (value !== null) return value;
  }
  return null;
}

function hasValue(row: NormalizedRecord, field: string): boolean {
  const value = valueFor(row, field);
  return value !== undefined && value !== null && value !== '';
}

function setAliases(row: NormalizedRecord, labels: string[], value: number) {
  for (const label of labels) {
    const keys = [label, toApiSafePath(label)];
    const lowerCamel = label.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
    const camel = lowerCamel.charAt(0).toLowerCase() + lowerCamel.slice(1);
    keys.push(camel);
    for (const key of keys) {
      if (key && !Object.prototype.hasOwnProperty.call(row, key)) {
        row[key] = value;
      }
    }
  }
}

/**
 * Some ERP payloads intentionally omit redundant invoice row totals that the
 * Desktop source already carries (for example Total GST and Final Amount).
 * Reconstruct those values only when they are absent, using the same row-level
 * values already available to the template. Explicit caller values always win.
 */
function materializeDerivedFinancialRows(group: DocumentGroup): DocumentGroup {
  if (!group.items.length) return group;
  const items = group.items.map((input) => {
    const row = normalizedRecord(input);

    if (!hasValue(row, 'Total GST')) {
      const cgst = firstNumeric(row, ['CGST Amount', 'cgstAmount']);
      const sgst = firstNumeric(row, ['SGST Amount', 'sgstAmount']);
      const igst = firstNumeric(row, ['IGST Amount', 'igstAmount']);
      const components = [cgst, sgst, igst].filter((value): value is number => value !== null);
      let totalGst: number | null = components.length ? components.reduce((sum, value) => sum + value, 0) : null;

      if (totalGst === null) {
        const taxable = firstNumeric(row, ['Taxable Value', 'Taxable', 'taxableValue', 'taxable']);
        const gstRateRaw = firstNumeric(row, ['GST %', 'gstPercent']);
        if (taxable !== null && gstRateRaw !== null) {
          const gstRate = Math.abs(gstRateRaw) > 1 ? gstRateRaw / 100 : gstRateRaw;
          totalGst = taxable * gstRate;
        }
      }

      if (totalGst !== null && Number.isFinite(totalGst)) {
        setAliases(row, ['Total GST'], totalGst);
      }
    }

    if (!hasValue(row, 'Final Amount')) {
      const taxable = firstNumeric(row, ['Taxable Value', 'Taxable', 'taxableValue', 'taxable']);
      const totalGst = firstNumeric(row, ['Total GST', 'totalGst', 'totalGST']);
      if (taxable !== null && totalGst !== null) {
        setAliases(row, ['Final Amount'], taxable + totalGst);
      }
    }

    return row;
  });
  return { ...group, items };
}

function aggregate(rows: NormalizedRecord[], field: string, operation: string): NormalizedValue {
  const op = operation.toLocaleLowerCase();
  const values = rows.map((row) => valueFor(row, field)).filter((value) => value !== undefined && value !== null && value !== '');
  if (op === 'group' || op === 'first') return (values[0] ?? null) as NormalizedValue;
  if (op === 'count') return values.length;
  const numbers = values.map(numeric).filter((value): value is number => value !== null);
  if (op === 'sum') return numbers.reduce((sum, value) => sum + value, 0);
  if (op === 'avg' || op === 'average') return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
  if (op === 'min') return numbers.length ? Math.min(...numbers) : 0;
  if (op === 'max') return numbers.length ? Math.max(...numbers) : 0;
  return (values[0] ?? null) as NormalizedValue;
}

function evaluateGroupedFormula(expression: string, valuesByLabel: Map<string, NormalizedValue>): number {
  const bindings: FormulaFieldBinding[] = [];
  let index = 0;
  const converted = expression.replace(/\[([^\]]+)\]/g, (_match, raw: string) => {
    const label = raw.trim();
    const id = `g${index++}`;
    bindings.push({ id, label, path: toApiSafePath(label), sourceField: label, targetPath: toApiSafePath(label), sourcePath: 'items' });
    return `{{${id}}}`;
  });
  const row: NormalizedRecord = {};
  for (const [label, value] of valuesByLabel) {
    row[label] = value;
    row[toApiSafePath(label)] = value;
  }
  return evaluateFormula(converted, bindings, { rows: [row], defaultSourcePath: 'items' });
}

function materializeGroupedTables(template: TemplateDefinition, group: DocumentGroup): DocumentGroup {
  const specs = groupedSpecs(template);
  if (!specs.length) return group;
  const header: NormalizedRecord = { ...group.header };

  for (const spec of specs) {
    const buckets = new Map<string, NormalizedRecord[]>();
    for (const row of group.items) {
      const keyValues = spec.groupBy.map((field) => valueFor(row, field));
      const key = JSON.stringify(keyValues);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(row);
    }

    const groupedRows: NormalizedRecord[] = [];
    for (const rows of buckets.values()) {
      const output: NormalizedRecord = {};
      const valuesByLabel = new Map<string, NormalizedValue>();
      for (const column of spec.columns.filter((column) => column.operation.toLocaleLowerCase() !== 'formula')) {
        const value = aggregate(rows, column.field ?? '', column.operation);
        output[column.outputKey] = value;
        if (column.label) {
          output[column.label] = value;
          output[toApiSafePath(column.label)] = value;
          valuesByLabel.set(column.label, value);
        }
      }
      for (const column of spec.columns.filter((candidate) => candidate.operation.toLocaleLowerCase() === 'formula')) {
        let value: NormalizedValue = 0;
        try { value = evaluateGroupedFormula(column.formula ?? '0', valuesByLabel); } catch { value = 0; }
        output[column.outputKey] = value;
        if (column.label) {
          output[column.label] = value;
          output[toApiSafePath(column.label)] = value;
          valuesByLabel.set(column.label, value);
        }
      }
      groupedRows.push(output);
    }
    setPath(header, spec.sourcePath, groupedRows as unknown as NormalizedValue);
  }

  return { ...group, header };
}

/**
 * DB-6B Fix10 shared parity bridge.
 *
 * The desktop preview resolves calculated table columns before grouped summaries
 * and document-level totals. Headless generation now materializes the same order
 * into the DocumentGroup before TemplateEngine renders it.
 */
export function applyDesktopResolvedDocumentParity(template: TemplateDefinition, group: DocumentGroup): DocumentGroup {
  return materializeGroupedTables(template, materializeDerivedFinancialRows(materializeTableFormulaRows(template, group)));
}
