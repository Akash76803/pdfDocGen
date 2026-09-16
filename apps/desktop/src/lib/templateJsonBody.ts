import { toApiSafePath, type FieldDefinition, type NormalizedRecord, type NormalizedValue } from '@document-tool/contracts';
import type { BuilderDataSource } from './dataSourceStore.ts';
import { valueForField } from './dataSourceStore.ts';
import type { TableCell, TableDefinition, TableRow } from './tableModel.ts';

export type JsonBodyElement = {
  id: string;
  type: string;
  text?: string;
  binding?: string;
  shapeMediaBinding?: string;
  conditionEnabled?: boolean;
  conditionField?: string;
  formulaName?: string;
  formulaExpression?: string;
  table?: TableDefinition;
};

export type JsonBodyPage = { id?: string; name?: string; elements: JsonBodyElement[] };

export type TemplateJsonBodyResult = {
  body: Record<string, unknown>;
  json: string;
  documentFields: string[];
  itemFields: string[];
  formulaFieldsExcluded: string[];
  calculatedFieldsExcluded: string[];
  itemCount: number;
  warnings: string[];
  request: Record<string, unknown>;
  requestJson: string;
};

const SYSTEM_TOKENS = new Set(['pagenumber', 'totalpages']);

function tokenNames(value: string | undefined): string[] {
  if (!value) return [];
  return [...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => match[1]?.trim()).filter((item): item is string => Boolean(item));
}

function aggregateFormulaCandidates(expression: string | undefined): string[] {
  if (!expression) return [];
  const refs = new Set<string>();
  for (const match of expression.matchAll(/\b(?:SUM|COUNT|AVG|MIN|MAX)\s*\(\s*(?:\[([^\]]+)\]|([A-Za-z_$][A-Za-z0-9_.$]*))?\s*\)/gi)) {
    const name = (match[1] ?? match[2] ?? '').trim();
    if (name) refs.add(name);
  }
  return [...refs];
}

function formulaCandidates(expression: string | undefined): string[] {
  if (!expression) return [];
  const refs = new Set<string>();
  for (const match of expression.matchAll(/\[([^\]]+)\]/g)) {
    const name = match[1]?.trim();
    if (name) refs.add(name);
  }
  for (const name of tokenNames(expression)) refs.add(name);
  const scrubbed = expression.replace(/\[[^\]]+\]/g, ' ').replace(/\{\{[^{}]+\}\}/g, ' ');
  for (const match of scrubbed.matchAll(/[A-Za-z_$][A-Za-z0-9_.$]*/g)) refs.add(match[0]);
  return [...refs];
}

type DependencyScope = 'document' | 'item';
type CalculationDependency = { name: string; scope: DependencyScope };
type CalculationNode = { displayName: string; dependencies: CalculationDependency[] };
type CalculationIndex = { byAlias: Map<string, CalculationNode>; displayNames: Set<string> };

function fieldLookup(fields: FieldDefinition[]) {
  return new Map(fields.map((field) => [field.name.toLocaleLowerCase(), field]));
}

function sourceFieldName(candidate: string | undefined, fields: FieldDefinition[]): string | null {
  const raw = candidate?.trim();
  if (!raw) return null;
  const key = raw.toLocaleLowerCase();
  if (SYSTEM_TOKENS.has(key)) return null;
  const lookup = fieldLookup(fields);
  return lookup.get(key)?.name ?? null;
}

function cells(rows: TableRow[]): TableCell[] {
  return rows.flatMap((row) => row.cells);
}

function addCalculationNode(index: CalculationIndex, displayName: string, aliases: Array<string | undefined>, dependencies: CalculationDependency[]) {
  const cleanDisplay = displayName.trim();
  if (cleanDisplay) index.displayNames.add(cleanDisplay);
  const node: CalculationNode = { displayName: cleanDisplay || displayName, dependencies };
  for (const alias of aliases) {
    const key = alias?.trim().toLocaleLowerCase();
    if (key && !SYSTEM_TOKENS.has(key)) index.byAlias.set(key, node);
  }
}

function buildCalculationIndex(pages: JsonBodyPage[]): CalculationIndex {
  const index: CalculationIndex = { byAlias: new Map(), displayNames: new Set() };
  const elements = pages.flatMap((page) => page.elements);

  // Document Formula Fields are internal outputs. Aggregate references are item-level
  // dependencies; ordinary references are document-level unless they resolve to another
  // calculated node later.
  for (const element of elements) {
    if (element.type !== 'formula' || !element.formulaName?.trim()) continue;
    const aggregateRefs = new Set(aggregateFormulaCandidates(element.formulaExpression).map((name) => name.toLocaleLowerCase()));
    const dependencies = formulaCandidates(element.formulaExpression).map((name) => ({
      name,
      scope: aggregateRefs.has(name.toLocaleLowerCase()) ? 'item' as const : 'document' as const,
    }));
    addCalculationNode(index, element.formulaName, [element.formulaName], dependencies);
  }

  // Dynamic table formula columns are row-level calculated outputs. Summary cells in the
  // same physical column can carry a legacy/source alias (for example Taxable Value for a
  // calculated Taxable column); treat that alias as the same internal output so it is not
  // accidentally emitted into the external request.
  for (const element of elements) {
    const table = element.type === 'table' ? element.table : undefined;
    if (!table) continue;

    if (table.mode === 'dynamic') {
      const bodyCells = table.bodyRows[0]?.cells ?? [];
      table.columns.forEach((column, columnIndex) => {
        const cell = bodyCells[columnIndex];
        if (!cell || cell.valueMode !== 'formula' || !cell.formula?.trim()) return;
        const aliases: Array<string | undefined> = [column.label, column.key, cell.binding];
        for (const row of table.customRows) {
          const summaryCell = row.cells[columnIndex];
          if (!summaryCell || (summaryCell.summaryMode !== 'aggregate' && summaryCell.summaryMode !== 'formula')) continue;
          aliases.push(summaryCell.summaryName, summaryCell.aggregate?.field);
        }
        const dependencies = formulaCandidates(cell.formula).map((name) => ({ name, scope: 'item' as const }));
        addCalculationNode(index, column.label || column.key, aliases, dependencies);
      });

      // Grouped rows are generated inside Document Builder. Their synthetic keys and
      // aggregate/formula outputs are never external inputs; only their raw dependencies are.
      for (const grouped of table.binding?.grouping?.columns ?? []) {
        const dependencies = grouped.operation === 'formula'
          ? formulaCandidates(grouped.formula).map((name) => ({ name, scope: 'item' as const }))
          : (grouped.field?.trim() ? [{ name: grouped.field.trim(), scope: 'item' as const }] : []);
        const groupedAliases = grouped.operation === 'formula' && !grouped.field?.trim()
          ? [grouped.outputKey, grouped.label]
          : [grouped.outputKey];
        addCalculationNode(index, grouped.label || grouped.outputKey, groupedAliases, dependencies);
      }

      // Final/custom summary outputs are also internal calculations. Register their names and
      // column aliases where available, but do not replace an existing body-formula mapping.
      for (const row of table.customRows) {
        row.cells.forEach((cell, columnIndex) => {
          if (cell.summaryMode !== 'aggregate' && cell.summaryMode !== 'formula') return;
          const column = table.columns[columnIndex];
          const dependencies = cell.summaryMode === 'formula'
            ? formulaCandidates(cell.summaryFormula).map((name) => ({ name, scope: 'item' as const }))
            : (cell.aggregate?.field?.trim() ? [{ name: cell.aggregate.field.trim(), scope: 'item' as const }] : []);
          const aliases = cell.summaryName?.trim() ? [cell.summaryName] : [];
          addCalculationNode(index, cell.summaryName || column?.label || 'Summary', aliases, dependencies);
        });
      }
    } else {
      // Custom-table formula cells are document-level calculated content.
      for (const cell of cells(table.rows)) {
        if (cell.valueMode !== 'formula' || !cell.formula?.trim()) continue;
        const name = cell.binding?.trim() || cell.content?.trim();
        if (!name) continue;
        addCalculationNode(index, name, [name], formulaCandidates(cell.formula).map((dep) => ({ name: dep, scope: 'document' as const })));
      }
    }
  }
  return index;
}

function resolveCandidate(
  candidate: string | undefined,
  scope: DependencyScope,
  document: Set<string>,
  items: Set<string>,
  fields: FieldDefinition[],
  calculations: CalculationIndex,
  stack = new Set<string>(),
) {
  const raw = candidate?.trim();
  if (!raw) return;
  const key = raw.toLocaleLowerCase();
  if (SYSTEM_TOKENS.has(key)) return;

  const calculated = calculations.byAlias.get(key);
  if (calculated) {
    if (stack.has(key)) {
      // A calculated output may intentionally aggregate a raw source field with the same
      // display name (for example TOTAL GST = SUM([Total GST])). In that self-reference
      // case, fall back to the actual source field instead of dropping the dependency.
      const source = sourceFieldName(raw, fields);
      if (source) (scope === 'item' ? items : document).add(source);
      return;
    }
    const nextStack = new Set(stack);
    nextStack.add(key);
    for (const dependency of calculated.dependencies) {
      resolveCandidate(dependency.name, dependency.scope, document, items, fields, calculations, nextStack);
    }
    return;
  }

  const source = sourceFieldName(raw, fields);
  if (!source) return;
  (scope === 'item' ? items : document).add(source);
}

function resolveTextTokens(
  value: string | undefined,
  scope: DependencyScope,
  document: Set<string>,
  items: Set<string>,
  fields: FieldDefinition[],
  calculations: CalculationIndex,
) {
  for (const token of tokenNames(value)) resolveCandidate(token, scope, document, items, fields, calculations);
}

function resolveFormulaReferences(
  expression: string | undefined,
  scope: DependencyScope,
  document: Set<string>,
  items: Set<string>,
  fields: FieldDefinition[],
  calculations: CalculationIndex,
) {
  for (const ref of formulaCandidates(expression)) resolveCandidate(ref, scope, document, items, fields, calculations);
}

function collectCellInputs(
  cell: TableCell,
  scope: DependencyScope,
  document: Set<string>,
  items: Set<string>,
  fields: FieldDefinition[],
  calculations: CalculationIndex,
) {
  if (cell.summaryMode === 'aggregate') {
    resolveCandidate(cell.aggregate?.field, 'item', document, items, fields, calculations);
    return;
  }
  if (cell.summaryMode === 'formula') {
    resolveFormulaReferences(cell.summaryFormula, 'item', document, items, fields, calculations);
    return;
  }
  if (cell.valueMode === 'formula') {
    resolveFormulaReferences(cell.formula, scope, document, items, fields, calculations);
    return;
  }
  resolveCandidate(cell.binding, scope, document, items, fields, calculations);
  resolveTextTokens(cell.content, scope, document, items, fields, calculations);
}

function collectTableInputs(
  table: TableDefinition,
  document: Set<string>,
  items: Set<string>,
  fields: FieldDefinition[],
  calculations: CalculationIndex,
) {
  if (table.mode === 'custom') {
    for (const cell of cells(table.rows)) collectCellInputs(cell, 'document', document, items, fields, calculations);
    return;
  }

  const binding = table.binding;
  for (const parentKey of binding?.parentKeys?.filter(Boolean) ?? (binding?.parentKey ? [binding.parentKey] : [])) {
    resolveCandidate(parentKey, 'document', document, items, fields, calculations);
  }
  resolveCandidate(binding?.parentKey, 'document', document, items, fields, calculations);
  resolveCandidate(binding?.childForeignKey, 'document', document, items, fields, calculations);

  for (const cell of cells(table.bodyRows)) collectCellInputs(cell, 'item', document, items, fields, calculations);
  for (const cell of cells(table.customRows)) collectCellInputs(cell, 'item', document, items, fields, calculations);

  for (const groupBy of binding?.grouping?.groupBy ?? []) resolveCandidate(groupBy, 'item', document, items, fields, calculations);
  for (const column of binding?.grouping?.columns ?? []) {
    if (column.operation === 'formula') resolveFormulaReferences(column.formula, 'item', document, items, fields, calculations);
    else resolveCandidate(column.field, 'item', document, items, fields, calculations);
  }
}

function placeholderFor(field: FieldDefinition | undefined): unknown {
  if (!field) return null;
  switch (field.type) {
    case 'number': return 0;
    case 'boolean': return false;
    case 'date': return 'YYYY-MM-DD';
    case 'datetime': return 'YYYY-MM-DDTHH:mm:ssZ';
    case 'array': return [];
    case 'object': return {};
    case 'null': return null;
    default: return '';
  }
}

function serializableValue(value: NormalizedValue | undefined, field: FieldDefinition | undefined): unknown {
  if (value === undefined || value === null) return placeholderFor(field);
  if (Array.isArray(value)) return value.map((item) => serializableValue(item, undefined));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializableValue(item, undefined)]));
  return value;
}

function setNested(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.').map((item) => item.trim()).filter(Boolean);
  if (parts.length <= 1) {
    target[path] = value;
    return;
  }
  let current: Record<string, unknown> = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!;
    const existing = current[part];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function stripRowPrefix(path: string, repeatSources: string[]): string {
  const lower = path.toLocaleLowerCase();
  for (const source of repeatSources) {
    const prefix = `${source.trim().toLocaleLowerCase()}.`;
    if (source.trim() && lower.startsWith(prefix)) return path.slice(prefix.length);
  }
  for (const conventional of ['items.', 'lineitems.', 'line_items.', 'rows.']) {
    if (lower.startsWith(conventional)) return path.slice(conventional.length);
  }
  return path;
}

function matchingDocumentRows(source: BuilderDataSource | null | undefined, record: NormalizedRecord | null | undefined, parentKeys: string[]): NormalizedRecord[] {
  if (!source || !record) return record ? [record] : [];
  if (!parentKeys.length) return [record];
  const expected = parentKeys.map((key) => valueForField(record, key));
  return source.records.filter((row) => parentKeys.every((key, index) => {
    const actual = valueForField(row, key);
    return JSON.stringify(actual ?? null) === JSON.stringify(expected[index] ?? null);
  }));
}

export function buildCurrentDocumentJsonBody(input: {
  pages: JsonBodyPage[];
  source?: BuilderDataSource | null;
  record?: NormalizedRecord | null;
  templateId?: string;
  templateName?: string;
  outputFormat?: 'pdf' | 'docx-editable';
}): TemplateJsonBodyResult {
  const fields = input.source?.fields ?? [];
  const calculations = buildCalculationIndex(input.pages);
  const formulaNames = input.pages.flatMap((page) => page.elements)
    .filter((element) => element.type === 'formula' && Boolean(element.formulaName?.trim()))
    .map((element) => element.formulaName!.trim());

  const documentFields = new Set<string>();
  const explicitDocumentFields = new Set<string>();
  const itemFields = new Set<string>();
  const parentKeys = new Set<string>();
  const repeatSources = new Set<string>();
  const allElements = input.pages.flatMap((page) => page.elements);

  for (const element of allElements) {
    if (element.type === 'formula') {
      // Resolve the Formula Field transitively to its leaf/source dependencies. The formula
      // output itself never crosses the API boundary.
      resolveCandidate(element.formulaName, 'document', documentFields, itemFields, fields, calculations);
      continue;
    }
    resolveCandidate(element.binding, 'document', explicitDocumentFields, itemFields, fields, calculations);
    resolveCandidate(element.shapeMediaBinding, 'document', explicitDocumentFields, itemFields, fields, calculations);
    if (element.conditionEnabled) resolveCandidate(element.conditionField, 'document', explicitDocumentFields, itemFields, fields, calculations);
    resolveTextTokens(element.text, 'document', explicitDocumentFields, itemFields, fields, calculations);
    if (element.type === 'table' && element.table) {
      collectTableInputs(element.table, explicitDocumentFields, itemFields, fields, calculations);
      const binding = element.table.binding;
      for (const key of binding?.parentKeys?.filter(Boolean) ?? (binding?.parentKey ? [binding.parentKey] : [])) parentKeys.add(key);
      if (binding?.repeatSource) repeatSources.add(binding.repeatSource);
    }
  }

  for (const field of explicitDocumentFields) documentFields.add(field);

  // Formula dependencies that are also row-level dependencies belong in `items`,
  // not duplicated at document level unless another non-table element uses them.
  const rowOnly = new Set(itemFields);
  const fieldByName = new Map(fields.map((field) => [field.name.toLocaleLowerCase(), field]));
  const body: Record<string, unknown> = {};
  for (const path of [...documentFields].sort()) {
    if (rowOnly.has(path) && !parentKeys.has(path) && !explicitDocumentFields.has(path)) continue;
    const field = fieldByName.get(path.toLocaleLowerCase());
    setNested(body, toApiSafePath(path), serializableValue(valueForField(input.record ?? null, path), field));
  }

  const rows = matchingDocumentRows(input.source, input.record, [...parentKeys]);
  if (itemFields.size > 0) {
    const itemList = (rows.length ? rows : [input.record ?? {}]).map((row) => {
      const item: Record<string, unknown> = {};
      for (const path of [...itemFields].sort()) {
        const field = fieldByName.get(path.toLocaleLowerCase());
        const outputPath = toApiSafePath(stripRowPrefix(path, [...repeatSources]));
        setNested(item, outputPath, serializableValue(valueForField(row, path), field));
      }
      return item;
    });
    body.items = itemList;
  }

  const warnings: string[] = [];
  if (!input.source) warnings.push('No Data Source is selected. Placeholder values are used.');
  if (fields.length === 0 && (documentFields.size > 0 || itemFields.size > 0)) warnings.push('Binding metadata is unavailable, so some template tokens could not be classified.');
  if (itemFields.size > 0 && !parentKeys.size) warnings.push('No Parent / Document key is configured; the sample body contains only the current row in items[].');
  const templateId = input.templateId?.trim() ?? '';
  if (!templateId) warnings.push('Save/open a template before copying the API request so templateId can be populated.');
  const outputFormat = input.outputFormat ?? 'pdf';
  const extension = outputFormat === 'docx-editable' ? 'docx' : 'pdf';
  const safeBaseName = (input.templateName?.trim() || 'document').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-');
  const request: Record<string, unknown> = {
    templateId,
    output: {
      format: outputFormat,
      fileName: `${safeBaseName}.${extension}`,
      ...(outputFormat === 'pdf' ? { renderMode: 'native-auto' } : {}),
      responseMode: 'binary',
    },
    data: body,
  };

  const externalSourceNames = new Set([...documentFields, ...itemFields].map((field) => field.toLocaleLowerCase()));
  const calculatedFieldsExcluded = [...new Set([
    ...formulaNames,
    ...[...calculations.displayNames].filter((name) => Boolean(name) && !externalSourceNames.has(name.toLocaleLowerCase())),
  ])].sort();

  return {
    body,
    json: JSON.stringify(body, null, 2),
    request,
    requestJson: JSON.stringify(request, null, 2),
    documentFields: [...documentFields].filter((field) => !rowOnly.has(field) || parentKeys.has(field) || explicitDocumentFields.has(field)).sort(),
    itemFields: [...itemFields].sort(),
    formulaFieldsExcluded: [...new Set(formulaNames)].sort(),
    calculatedFieldsExcluded,
    itemCount: Array.isArray(body.items) ? body.items.length : 0,
    warnings,
  };
}


export type TemplateInputPrimitiveType = 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'object' | 'array' | 'null';

export type TemplateInputFieldContract = {
  path: string;
  label: string;
  type: TemplateInputPrimitiveType;
  required: boolean;
  nullable: boolean;
  description?: string;
  contentKind?: 'image';
  acceptedImageSources?: Array<'url' | 'base64' | 'data-url'>;
};

export type TemplateInputCollectionContract = {
  path: 'items';
  required: boolean;
  fields: TemplateInputFieldContract[];
  requiredFields: string[];
  optionalFields: string[];
};

export type TemplateInputContract = {
  contractVersion: '1.0';
  template: { id?: string; name?: string };
  required: string[];
  optional: string[];
  fields: TemplateInputFieldContract[];
  collections: { items?: TemplateInputCollectionContract };
  calculatedInternally: string[];
  example: Record<string, unknown>;
  warnings: string[];
};

export type TemplateInputContractResult = {
  contract: TemplateInputContract;
  json: string;
};

function imageInputFields(pages: JsonBodyPage[]): Set<string> {
  const result = new Set<string>();
  for (const element of pages.flatMap((page) => page.elements)) {
    if ((element.type === 'image' || element.type === 'signature') && element.binding?.trim()) result.add(element.binding.trim().toLocaleLowerCase());
    if (element.shapeMediaBinding?.trim()) result.add(element.shapeMediaBinding.trim().toLocaleLowerCase());
    if (element.type === 'table' && element.table) {
      for (const cell of [...cells(element.table.rows), ...cells(element.table.bodyRows), ...cells(element.table.customRows)]) {
        if (cell.type === 'image' && cell.binding?.trim()) result.add(cell.binding.trim().toLocaleLowerCase());
      }
    }
  }
  return result;
}

function contractField(path: string, fields: FieldDefinition[], imageFields: Set<string>, outputPath = path): TemplateInputFieldContract {
  const definition = fields.find((field) => field.name.toLocaleLowerCase() === path.toLocaleLowerCase());
  const isImage = imageFields.has(path.toLocaleLowerCase());
  return {
    path: outputPath,
    label: definition?.label ?? outputPath,
    type: (definition?.type ?? 'string') as TemplateInputPrimitiveType,
    required: definition?.required ?? false,
    nullable: definition?.nullable ?? true,
    ...(definition?.description ? { description: definition.description } : {}),
    ...(isImage ? { contentKind: 'image' as const, acceptedImageSources: ['url', 'base64', 'data-url'] as Array<'url' | 'base64' | 'data-url'> } : {}),
  };
}

/**
 * DB-6A external integration contract. External systems send raw source values only;
 * formula outputs stay inside Document Builder and are exposed under calculatedInternally.
 */
export function buildTemplateInputContract(input: {
  pages: JsonBodyPage[];
  source?: BuilderDataSource | null;
  record?: NormalizedRecord | null;
  templateId?: string;
  templateName?: string;
}): TemplateInputContractResult {
  const bodyResult = buildCurrentDocumentJsonBody(input);
  const fields = input.source?.fields ?? [];
  const imageFields = imageInputFields(input.pages);
  const repeatSources = new Set<string>();
  for (const element of input.pages.flatMap((page) => page.elements)) {
    if (element.type === 'table' && element.table?.binding?.repeatSource) repeatSources.add(element.table.binding.repeatSource);
  }

  const documentFields = bodyResult.documentFields.map((path) => contractField(path, fields, imageFields, toApiSafePath(path)));
  const itemFields = bodyResult.itemFields.map((path) => contractField(path, fields, imageFields, toApiSafePath(stripRowPrefix(path, [...repeatSources]))));
  const required = documentFields.filter((field) => field.required).map((field) => field.path).sort();
  const optional = documentFields.filter((field) => !field.required).map((field) => field.path).sort();
  const itemRequired = itemFields.filter((field) => field.required).map((field) => field.path).sort();
  const itemOptional = itemFields.filter((field) => !field.required).map((field) => field.path).sort();

  const contract: TemplateInputContract = {
    contractVersion: '1.0',
    template: {
      ...(input.templateId?.trim() ? { id: input.templateId.trim() } : {}),
      ...(input.templateName?.trim() ? { name: input.templateName.trim() } : {}),
    },
    required,
    optional,
    fields: documentFields,
    collections: itemFields.length ? {
      items: { path: 'items', required: itemRequired.length > 0, fields: itemFields, requiredFields: itemRequired, optionalFields: itemOptional },
    } : {},
    calculatedInternally: bodyResult.calculatedFieldsExcluded,
    example: bodyResult.body,
    warnings: bodyResult.warnings,
  };

  return { contract, json: JSON.stringify(contract, null, 2) };
}
