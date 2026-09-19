import type { FieldDefinition, NormalizedRecord, NormalizedValue } from '@document-tool/contracts';
import type { BuilderDataSource } from './dataSourceStore.ts';
import { evaluateBuilderConditionalRendering, normalizeConditionalRendering, type BuilderConditionalRendering } from './conditionalRendering.ts';

export type TableMode = 'dynamic' | 'custom';
export type TableCellType = 'text' | 'image' | 'qr' | 'barcode';
export type TableRowKind = 'header' | 'body' | 'custom';
export type TableAlign = 'left' | 'center' | 'right';
export type TableValueMode = 'custom' | 'binding' | 'formula';
export type TableAggregateOperation = 'sum' | 'count' | 'avg' | 'min' | 'max';
export type TableSummaryMode = 'custom' | 'aggregate' | 'formula';
export type TableDataType = 'text' | 'number' | 'decimal' | 'currency' | 'percentage' | 'date' | 'datetime' | 'time' | 'checkbox';
export type TableDataFormat = {
  decimals?: number;
  thousandsSeparator?: boolean;
  currencyCode?: string;
  currencySymbol?: string;
  percentInputMode?: 'fraction' | 'whole';
  dateFormat?: 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd' | 'dd MMM yyyy';
  timeFormat?: '12h' | '24h';
  trueValue?: string;
  falseValue?: string;
  checkboxStyle?: 'checkbox' | 'labels';
  nullDisplay?: string;
};

export type TableCellStyle = {
  background: string;
  color: string;
  fontSize: number;
  bold: boolean;
  align: TableAlign;
  verticalAlign: 'top' | 'middle' | 'bottom';
  padding: number;
};

export type TableCell = {
  id: string;
  type: TableCellType;
  content: string;
  binding?: string;
  formula?: string;
  valueMode?: TableValueMode;
  /** DB-4.3B: summary-row calculation configuration. */
  summaryMode?: TableSummaryMode;
  aggregate?: { operation: TableAggregateOperation; field: string };
  summaryFormula?: string;
  summaryName?: string;
  dataType?: TableDataType;
  format?: TableDataFormat;
  imageSource?: string;
  imageAssetId?: string;
  imageFit?: 'contain' | 'cover' | 'fill';
  rowSpan: number;
  colSpan: number;
  style: TableCellStyle;
};

export type TableRow = {
  id: string;
  kind: TableRowKind;
  height: number;
  autoHeight: boolean;
  repeatOnEveryPage: boolean;
  keepTogether: boolean;
  /** DB-4.4: optional manual page break before this design row. */
  pageBreakBefore?: boolean;
  cells: TableCell[];
};

export type DynamicColumnMapping = { label: string; field: string; dataType?: TableDataType };
export type GroupedAggregateOperation = 'group' | 'sum' | 'count' | 'avg' | 'min' | 'max' | 'first' | 'last' | 'formula';
export type GroupedColumnMapping = {
  label: string;
  field: string;
  operation: GroupedAggregateOperation;
  /** DB-4G Fix1: formula is evaluated after group/aggregate columns for each grouped output row. */
  formula?: string;
  dataType?: TableDataType;
};
export type GroupedTableConfig = {
  groupBy: string[];
  columns: Array<GroupedColumnMapping & { outputKey: string }>;
};

export type GroupedFinalSummaryOperation = 'blank' | 'label' | 'sum' | 'count' | 'avg' | 'min' | 'max' | 'formula';
export type GroupedFinalSummaryColumn = {
  operation: GroupedFinalSummaryOperation;
  text?: string;
  formula?: string;
};
export type GroupedFinalSummaryConfig = {
  enabled: boolean;
  columns: GroupedFinalSummaryColumn[];
};

export type TableColumnConditionScope = 'document' | 'anyRow' | 'allRows';

export type TableColumn = {
  id: string;
  key: string;
  label: string;
  width: number;
  minWidth: number;
  maxWidth?: number;
  align: TableAlign;
  dataType?: TableDataType;
  format?: TableDataFormat;
  /** DB-4P Fix1: user-controlled width hint. When true, smart sizing respects this column more strongly. */
  manualWidth?: boolean;
  /** UX-8.4: whole-column visibility. */
  conditionalRendering?: BuilderConditionalRendering;
  conditionScope?: TableColumnConditionScope;
};

export type TableBorderStyle = 'solid' | 'dashed' | 'dotted' | 'double' | 'none';

export type TableDefinition = {
  id: string;
  name: string;
  mode: TableMode;
  columns: TableColumn[];
  headerRows: TableRow[];
  bodyRows: TableRow[];
  customRows: TableRow[];
  rows: TableRow[];
  binding?: {
    repeatSource: string;
    sourceId?: string;
    rowKey?: string;
    rowKeys?: string[];
    parentKey?: string;
    parentKeys?: string[];
    // Legacy DB-4.1 Fix3 relationship fields are retained for backward compatibility only.
    parentSourceId?: string;
    childForeignKey?: string;
    /** Grouped Summary Table: group the active document rows, then emit one aggregate row per group. */
    grouping?: GroupedTableConfig;
  };
  pagination: {
    enabled?: boolean;
    repeatHeader: boolean;
    allowRowSplit: boolean;
    keepRowsTogether: boolean;
    keepSummaryTogether?: boolean;
  };
  borderWidth: number;
  borderColor: string;
  borderStyle?: TableBorderStyle;
  defaultPadding: number;
  selectedCellId?: string;
  /** UX-8.4: filter dynamic runtime rows before pagination/rendering. */
  rowConditionalRendering?: BuilderConditionalRendering;
};

const defaultCellStyle = (): TableCellStyle => ({
  background: '#ffffff', color: '#18212f', fontSize: 11, bold: false,
  align: 'left', verticalAlign: 'middle', padding: 5,
});

export function createCell(content = '', type: TableCellType = 'text'): TableCell {
  return { id: crypto.randomUUID(), type, content, valueMode: 'custom', imageFit: type === 'image' ? 'cover' : undefined, rowSpan: 1, colSpan: 1, style: defaultCellStyle() };
}

function createColumns(count: number): TableColumn[] {
  return Array.from({ length: Math.max(1, count) }, (_, index) => ({
    id: crypto.randomUUID(), key: `col${index + 1}`, label: `Column ${index + 1}`,
    width: 120, minWidth: 40, align: 'left' as TableAlign, dataType: 'text' as TableDataType, format: {},
  }));
}

function createRow(kind: TableRowKind, columns: number, _index = 0): TableRow {
  return {
    id: crypto.randomUUID(), kind, height: kind === 'header' ? 32 : 30,
    autoHeight: true, repeatOnEveryPage: kind === 'header', keepTogether: true,
    cells: Array.from({ length: Math.max(1, columns) }, (_, columnIndex) => {
      const cell = createCell(kind === 'header' ? `Column ${columnIndex + 1}` : '');
      if (kind === 'header') {
        cell.style.bold = true;
        cell.style.background = '#f4f6f9';
      }
      if (kind === 'body') { cell.binding = `col${columnIndex + 1}`; cell.valueMode = 'binding'; }
      return cell;
    }),
  };
}

export function createCustomTable(columnCount: number, rowCount: number): TableDefinition {
  const columns = createColumns(columnCount);
  const rows = Array.from({ length: Math.max(1, rowCount) }, (_, index) => createRow('custom', columns.length, index));
  return {
    id: crypto.randomUUID(), name: 'Custom Table', mode: 'custom', columns,
    headerRows: [], bodyRows: [], customRows: [], rows,
    pagination: { enabled: true, repeatHeader: false, allowRowSplit: false, keepRowsTogether: true, keepSummaryTogether: true },
    borderWidth: 1, borderColor: '#cfd6df', borderStyle: 'solid', defaultPadding: 5,
  };
}

export function createDynamicTable(columnCount: number, repeatSource: string, headerRowCount = 1, binding?: { sourceId?: string; rowKey?: string; rowKeys?: string[]; parentKey?: string; parentKeys?: string[]; parentSourceId?: string; childForeignKey?: string }, columnMappings?: DynamicColumnMapping[]): TableDefinition {
  const mappings = (columnMappings ?? []).filter((item) => item.field);
  const effectiveCount = mappings.length > 0 ? mappings.length : columnCount;
  const columns = createColumns(effectiveCount);
  const headerRows = Array.from({ length: Math.max(0, headerRowCount) }, () => createRow('header', columns.length));
  const bodyRows = [createRow('body', columns.length)];

  if (mappings.length > 0) {
    mappings.forEach((mapping, index) => {
      const label = mapping.label.trim() || mapping.field;
      const column = columns[index];
      if (column) { column.key = mapping.field; column.label = label; column.dataType = mapping.dataType ?? 'text'; }
      for (const header of headerRows) {
        const cell = header.cells[index];
        if (cell) cell.content = label;
      }
      const bodyCell = bodyRows[0]?.cells[index];
      if (bodyCell) { bodyCell.binding = mapping.field; bodyCell.valueMode = 'binding'; bodyCell.content = ''; }
    });
  }

  return {
    id: crypto.randomUUID(), name: 'Dynamic Table', mode: 'dynamic', columns,
    headerRows, bodyRows, customRows: [], rows: [],
    binding: {
      repeatSource,
      sourceId: binding?.sourceId,
      rowKey: binding ? binding.rowKey : 'id',
      rowKeys: binding?.rowKeys?.filter(Boolean),
      parentKey: binding?.parentKey,
      parentKeys: binding?.parentKeys?.filter(Boolean),
      parentSourceId: binding?.parentSourceId,
      childForeignKey: binding?.childForeignKey,
    },
    pagination: { enabled: true, repeatHeader: true, allowRowSplit: false, keepRowsTogether: true, keepSummaryTogether: true },
    borderWidth: 1, borderColor: '#cfd6df', borderStyle: 'solid', defaultPadding: 5,
  };
}

/**
 * Grouped Summary Table (DB-4G): a data-driven table backed by the same flat source
 * as Dynamic Table, but its runtime rows are grouped and aggregated before rendering.
 * It intentionally stays mode='dynamic' so pagination, formatting, formulas, summaries,
 * Body Flow and renderer parity continue to use the proven Dynamic Table path.
 */
export function createGroupedSummaryTable(
  repeatSource: string,
  groupBy: string[],
  mappings: GroupedColumnMapping[],
  binding?: { sourceId?: string; parentKey?: string; parentKeys?: string[] },
): TableDefinition {
  const validGroupBy = groupBy.filter(Boolean);
  const validMappings = mappings.filter((item) => item.operation && (item.operation === 'formula' ? item.formula?.trim() : item.field));
  const normalizedMappings = validMappings.map((mapping, index) => ({
    ...mapping,
    outputKey: `__grouped_${index}`,
  }));
  const dynamicMappings: DynamicColumnMapping[] = normalizedMappings.map((mapping) => ({
    label: mapping.label.trim() || mapping.field,
    field: mapping.outputKey,
    dataType: mapping.dataType ?? (mapping.operation === 'group' || mapping.operation === 'first' || mapping.operation === 'last' ? 'text' : 'decimal'),
  }));
  const table = createDynamicTable(dynamicMappings.length, repeatSource, 1, {
    sourceId: binding?.sourceId,
    parentKey: binding?.parentKey,
    parentKeys: binding?.parentKeys,
    rowKey: validGroupBy[0],
    rowKeys: validGroupBy,
  }, dynamicMappings);
  return {
    ...table,
    name: 'Grouped Summary Table',
    binding: {
      ...table.binding!,
      grouping: { groupBy: validGroupBy, columns: normalizedMappings },
    },
  };
}

/**
 * Reconfigure an existing Grouped Summary Table without throwing away the table's
 * visual identity. Create/Edit share one configuration UI, while widths, formatting,
 * pagination and table-level styling are retained by column index where possible.
 */
export function reconfigureGroupedSummaryTable(
  existing: TableDefinition,
  repeatSource: string,
  groupBy: string[],
  mappings: GroupedColumnMapping[],
  binding?: { sourceId?: string; parentKey?: string; parentKeys?: string[] },
): TableDefinition {
  const next = createGroupedSummaryTable(repeatSource, groupBy, mappings, binding);
  const oldMappings = existing.binding?.grouping?.columns ?? [];
  const mappingIdentity = (mapping: GroupedColumnMapping) => [mapping.label.trim(), mapping.field, mapping.operation, mapping.formula?.trim() ?? ''].join('::');
  const usedOldIndexes = new Set<number>();
  const sourceIndexByNextIndex = mappings.map((mapping, nextIndex) => {
    const identity = mappingIdentity(mapping);
    const exactIndex = oldMappings.findIndex((oldMapping, oldIndex) => !usedOldIndexes.has(oldIndex) && mappingIdentity(oldMapping) === identity);
    if (exactIndex >= 0) {
      usedOldIndexes.add(exactIndex);
      return exactIndex;
    }
    const fallbackIndex = !usedOldIndexes.has(nextIndex) && existing.columns[nextIndex] ? nextIndex : -1;
    if (fallbackIndex >= 0) usedOldIndexes.add(fallbackIndex);
    return fallbackIndex;
  });
  const columns = next.columns.map((column, index) => {
    const oldIndex = sourceIndexByNextIndex[index];
    const old = oldIndex >= 0 ? existing.columns[oldIndex] : undefined;
    if (!old) return column;
    return {
      ...column,
      id: old.id,
      width: old.width,
      minWidth: old.minWidth,
      maxWidth: old.maxWidth,
      align: old.align,
      format: old.format,
      manualWidth: old.manualWidth,
    };
  });
  const headerRows = next.headerRows.map((row, rowIndex) => ({
    ...row,
    id: existing.headerRows[rowIndex]?.id ?? row.id,
    cells: row.cells.map((cell, index) => {
      const oldIndex = sourceIndexByNextIndex[index];
      const old = oldIndex >= 0 ? existing.headerRows[rowIndex]?.cells[oldIndex] : undefined;
      return old ? { ...cell, id: old.id, style: { ...old.style }, rowSpan: old.rowSpan, colSpan: old.colSpan } : cell;
    }),
  }));
  const bodyRows = next.bodyRows.map((row, rowIndex) => ({
    ...row,
    id: existing.bodyRows[rowIndex]?.id ?? row.id,
    cells: row.cells.map((cell, index) => {
      const oldIndex = sourceIndexByNextIndex[index];
      const old = oldIndex >= 0 ? existing.bodyRows[rowIndex]?.cells[oldIndex] : undefined;
      return old ? { ...cell, id: old.id, style: { ...old.style }, rowSpan: old.rowSpan, colSpan: old.colSpan, format: old.format } : cell;
    }),
  }));
  return {
    ...next,
    id: existing.id,
    name: existing.name,
    columns,
    headerRows,
    bodyRows,
    customRows: existing.customRows,
    pagination: { ...existing.pagination },
    borderWidth: existing.borderWidth,
    borderColor: existing.borderColor,
    borderStyle: existing.borderStyle ?? 'solid',
    defaultPadding: existing.defaultPadding,
    selectedCellId: existing.selectedCellId,
  };
}

export function isGroupedSummaryTable(table: TableDefinition | undefined): boolean {
  return Boolean(table?.binding?.grouping?.groupBy?.length && table.binding.grouping.columns?.length);
}

/**
 * DB-4G Fix2: final total row configuration for Grouped Summary tables. The final
 * row aggregates the already-grouped runtime output, never the raw line items.
 */
export function defaultGroupedFinalSummaryConfig(mappings: GroupedColumnMapping[]): GroupedFinalSummaryConfig {
  return {
    enabled: true,
    columns: mappings.map((mapping, index) => {
      if (index === 0) return { operation: 'label', text: 'TOTAL' };
      if (mapping.operation === 'group' || mapping.operation === 'first' || mapping.operation === 'last') return { operation: 'blank' };
      return { operation: 'sum' };
    }),
  };
}

export function groupedFinalSummaryConfigFromTable(table: TableDefinition): GroupedFinalSummaryConfig {
  const grouping = table.binding?.grouping;
  if (!grouping || table.customRows.length === 0) return defaultGroupedFinalSummaryConfig(grouping?.columns ?? []);
  const row = table.customRows[0];
  const columns = grouping.columns.map((_mapping, index): GroupedFinalSummaryColumn => {
    const cell = row.cells[index];
    if (!cell) return { operation: 'blank' };
    if (cell.summaryMode === 'formula') return { operation: 'formula', formula: cell.summaryFormula ?? '' };
    if (cell.summaryMode === 'aggregate') {
      const operation = cell.aggregate?.operation ?? 'sum';
      return { operation };
    }
    if (cell.content) return { operation: 'label', text: cell.content };
    return { operation: 'blank' };
  });
  return { enabled: true, columns };
}

export function applyGroupedFinalSummary(table: TableDefinition, config: GroupedFinalSummaryConfig): TableDefinition {
  const grouping = table.binding?.grouping;
  if (!grouping || !config.enabled) return { ...table, customRows: [] };
  const row = createRow('custom', table.columns.length);
  row.keepTogether = true;
  row.cells = row.cells.map((cell, index) => {
    const mapping = grouping.columns[index];
    const column = table.columns[index];
    const setting = config.columns[index] ?? { operation: 'blank' as const };
    const next: TableCell = {
      ...cell,
      content: '',
      binding: undefined,
      valueMode: 'custom',
      summaryMode: 'custom',
      aggregate: undefined,
      summaryFormula: undefined,
      summaryName: undefined,
      dataType: column?.dataType ?? mapping?.dataType ?? 'decimal',
      format: column?.format ? { ...column.format } : undefined,
      style: { ...cell.style, bold: true, align: index === 0 ? 'left' : 'right', background: '#f7f9fc' },
    };
    if (setting.operation === 'label') {
      next.content = setting.text?.trim() || (index === 0 ? 'TOTAL' : '');
      next.dataType = 'text';
      return next;
    }
    if (setting.operation === 'formula') {
      next.summaryMode = 'formula';
      next.summaryFormula = setting.formula ?? '';
      next.summaryName = mapping?.label?.trim() || column?.label?.trim() || `Summary ${index + 1}`;
      return next;
    }
    if (['sum', 'count', 'avg', 'min', 'max'].includes(setting.operation)) {
      next.summaryMode = 'aggregate';
      next.aggregate = { operation: setting.operation as TableAggregateOperation, field: mapping?.outputKey ?? column?.key ?? '' };
      next.summaryName = mapping?.label?.trim() || column?.label?.trim() || `Summary ${index + 1}`;
      return next;
    }
    return next;
  });
  return { ...table, customRows: [row], pagination: { ...table.pagination, keepSummaryTogether: true }, selectedCellId: table.selectedCellId };
}

export function addCustomSummaryRow(table: TableDefinition): TableDefinition {
  // DB-4.3B Fix1: a new summary row always starts with the same visual cell count
  // as the current table columns. Users can then merge the label area with colSpan.
  // This keeps the summary row aligned with table structure and means column add/delete
  // operations can continue to update it through the shared span-aware row helpers.
  const row = createRow('custom', table.columns.length);
  if (row.cells.length > 0) {
    const labelCell = row.cells[0];
    labelCell.content = 'Subtotal';
    labelCell.style.bold = true;

    const valueCell = row.cells[row.cells.length - 1];
    valueCell.content = '';
    valueCell.summaryMode = 'aggregate';
    valueCell.aggregate = { operation: 'sum', field: '' };
    valueCell.summaryName = 'Subtotal';
    valueCell.dataType = 'currency';
    valueCell.style.bold = true;
    valueCell.style.align = 'right';
  }
  return { ...table, customRows: [...table.customRows, row], selectedCellId: row.cells[row.cells.length - 1]?.id ?? row.cells[0]?.id };
}

export function updateTableCell(table: TableDefinition, cellId: string, patch: Partial<TableCell>): TableDefinition {
  const patchRows = (rows: TableRow[]) => rows.map((row) => ({ ...row, cells: row.cells.map((cell) => cell.id === cellId ? { ...cell, ...patch, style: patch.style ? { ...cell.style, ...patch.style } : cell.style, format: patch.format ? { ...(cell.format ?? {}), ...patch.format } : cell.format } : cell) }));
  return { ...table, headerRows: patchRows(table.headerRows), bodyRows: patchRows(table.bodyRows), customRows: patchRows(table.customRows), rows: patchRows(table.rows) };
}

export function findTableCell(table: TableDefinition | undefined, cellId: string | undefined): TableCell | null {
  if (!table || !cellId) return null;
  for (const rows of [table.headerRows, table.bodyRows, table.customRows, table.rows]) {
    for (const row of rows) for (const cell of row.cells) if (cell.id === cellId) return cell;
  }
  return null;
}



export type TableCellLocation = {
  section: 'headerRows' | 'bodyRows' | 'customRows' | 'rows';
  rowIndex: number;
  row: TableRow;
  cellIndex: number;
  cell: TableCell;
  columnIndex: number;
};

function rowCellVisualStart(row: TableRow, cellIndex: number): number {
  return row.cells.slice(0, cellIndex).reduce((sum, cell) => sum + Math.max(1, cell.colSpan), 0);
}

export function findTableCellLocation(table: TableDefinition, cellId: string | undefined): TableCellLocation | null {
  if (!cellId) return null;
  const sections: Array<TableCellLocation['section']> = ['headerRows', 'bodyRows', 'customRows', 'rows'];
  for (const section of sections) {
    const rows = table[section];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const cellIndex = row.cells.findIndex((cell) => cell.id === cellId);
      if (cellIndex >= 0) return { section, rowIndex, row, cellIndex, cell: row.cells[cellIndex], columnIndex: rowCellVisualStart(row, cellIndex) };
    }
  }
  return null;
}

function patchSection(table: TableDefinition, section: TableCellLocation['section'], rows: TableRow[]): TableDefinition {
  return { ...table, [section]: rows };
}

function cloneCellForStructure(cell: TableCell): TableCell {
  return { ...cell, id: crypto.randomUUID(), rowSpan: 1, colSpan: 1, style: { ...cell.style }, format: cell.format ? { ...cell.format } : undefined };
}

function cloneRowForStructure(row: TableRow): TableRow {
  return { ...row, id: crypto.randomUUID(), cells: row.cells.map(cloneCellForStructure) };
}

function normalizeSelectedCell(table: TableDefinition): TableDefinition {
  if (findTableCell(table, table.selectedCellId)) return table;
  const first = table.headerRows[0]?.cells[0] ?? table.bodyRows[0]?.cells[0] ?? table.customRows[0]?.cells[0] ?? table.rows[0]?.cells[0];
  return { ...table, selectedCellId: first?.id };
}

export function addTableRow(table: TableDefinition, cellId: string | undefined, where: 'above' | 'below'): TableDefinition {
  const loc = findTableCellLocation(table, cellId);
  if (!loc) return table;
  if (table.mode === 'dynamic' && loc.section === 'bodyRows') return table;
  const rows = [...table[loc.section]];
  const row = createRow(loc.row.kind, table.columns.length);
  const at = loc.rowIndex + (where === 'below' ? 1 : 0);
  rows.splice(at, 0, row);
  return { ...patchSection(table, loc.section, rows), selectedCellId: row.cells[0]?.id };
}

export function duplicateTableRow(table: TableDefinition, cellId: string | undefined): TableDefinition {
  const loc = findTableCellLocation(table, cellId);
  if (!loc) return table;
  if (table.mode === 'dynamic' && loc.section === 'bodyRows') return table;
  const rows = [...table[loc.section]];
  const duplicate = cloneRowForStructure(loc.row);
  rows.splice(loc.rowIndex + 1, 0, duplicate);
  return { ...patchSection(table, loc.section, rows), selectedCellId: duplicate.cells[0]?.id };
}

export function deleteTableRow(table: TableDefinition, cellId: string | undefined): TableDefinition {
  const loc = findTableCellLocation(table, cellId);
  if (!loc) return table;
  if (table.mode === 'dynamic' && loc.section === 'bodyRows') return table;
  const rows = [...table[loc.section]];
  if (table.mode === 'custom' && loc.section === 'rows' && rows.length <= 1) return table;
  if (loc.section === 'bodyRows' && rows.length <= 1) return table;
  rows.splice(loc.rowIndex, 1);
  return normalizeSelectedCell(patchSection(table, loc.section, rows));
}

export function moveTableRow(table: TableDefinition, cellId: string | undefined, direction: -1 | 1): TableDefinition {
  const loc = findTableCellLocation(table, cellId);
  if (!loc) return table;
  if (table.mode === 'dynamic' && loc.section === 'bodyRows') return table;
  const rows = [...table[loc.section]];
  const target = loc.rowIndex + direction;
  if (target < 0 || target >= rows.length) return table;
  [rows[loc.rowIndex], rows[target]] = [rows[target], rows[loc.rowIndex]];
  return patchSection(table, loc.section, rows);
}

function insertVisualColumnIntoRow(row: TableRow, columnIndex: number, duplicateFrom?: number): TableRow {
  const cells = row.cells.map((cell) => ({ ...cell, style: { ...cell.style } }));
  let cursor = 0;
  let insertAt = cells.length;
  let sourceCell: TableCell | undefined;
  for (let i = 0; i < cells.length; i += 1) {
    const span = Math.max(1, cells[i].colSpan);
    const start = cursor;
    const end = cursor + span;
    if (duplicateFrom != null && duplicateFrom >= start && duplicateFrom < end) sourceCell = cells[i];
    if (columnIndex > start && columnIndex < end) {
      cells[i].colSpan = span + 1;
      return { ...row, cells };
    }
    if (columnIndex <= start) { insertAt = i; break; }
    cursor = end;
  }
  const newCell = sourceCell ? cloneCellForStructure(sourceCell) : createCell(row.kind === 'header' ? 'New Column' : '');
  if (row.kind === 'header') { newCell.style.bold = true; newCell.style.background = '#f4f6f9'; }
  cells.splice(insertAt, 0, newCell);
  return { ...row, cells };
}

function deleteVisualColumnFromRow(row: TableRow, columnIndex: number): TableRow {
  const cells = row.cells.map((cell) => ({ ...cell, style: { ...cell.style } }));
  let cursor = 0;
  for (let i = 0; i < cells.length; i += 1) {
    const span = Math.max(1, cells[i].colSpan);
    if (columnIndex >= cursor && columnIndex < cursor + span) {
      if (span > 1) cells[i].colSpan = span - 1;
      else cells.splice(i, 1);
      break;
    }
    cursor += span;
  }
  return { ...row, cells };
}

function mapEveryTableRow(table: TableDefinition, mapper: (row: TableRow) => TableRow): TableDefinition {
  return {
    ...table,
    headerRows: table.headerRows.map(mapper),
    bodyRows: table.bodyRows.map(mapper),
    customRows: table.customRows.map(mapper),
    rows: table.rows.map(mapper),
  };
}

export function addTableColumn(table: TableDefinition, cellId: string | undefined, where: 'left' | 'right', duplicate = false): TableDefinition {
  const loc = findTableCellLocation(table, cellId);
  const baseIndex = loc?.columnIndex ?? table.columns.length - 1;
  const insertionIndex = Math.max(0, Math.min(table.columns.length, baseIndex + (where === 'right' ? 1 : 0)));
  const sourceIndex = duplicate ? baseIndex : undefined;
  const sourceColumn = duplicate && table.columns[baseIndex] ? table.columns[baseIndex] : undefined;
  const newColumn: TableColumn = sourceColumn
    ? { ...sourceColumn, id: crypto.randomUUID(), key: `${sourceColumn.key}_copy_${crypto.randomUUID().slice(0, 4)}`, label: `${sourceColumn.label} Copy` }
    : { id: crypto.randomUUID(), key: `col_${crypto.randomUUID().slice(0, 8)}`, label: 'New Column', width: 120, minWidth: 40, align: 'left' };
  const columns = [...table.columns];
  columns.splice(insertionIndex, 0, newColumn);
  let next = { ...table, columns };
  next = mapEveryTableRow(next, (row) => insertVisualColumnIntoRow(row, insertionIndex, sourceIndex));
  return next;
}

export function deleteTableColumn(table: TableDefinition, cellId: string | undefined): TableDefinition {
  if (table.columns.length <= 1) return table;
  const loc = findTableCellLocation(table, cellId);
  if (!loc) return table;
  const columnIndex = Math.min(table.columns.length - 1, loc.columnIndex);
  const columns = [...table.columns];
  columns.splice(columnIndex, 1);
  let next = { ...table, columns };
  next = mapEveryTableRow(next, (row) => deleteVisualColumnFromRow(row, columnIndex));
  return normalizeSelectedCell(next);
}

export function tableHasMergedColumns(table: TableDefinition): boolean {
  return [...table.headerRows, ...table.bodyRows, ...table.customRows, ...table.rows].some((row) => row.cells.some((cell) => Math.max(1, cell.colSpan) > 1));
}

export function moveTableColumn(table: TableDefinition, cellId: string | undefined, direction: -1 | 1): TableDefinition {
  const loc = findTableCellLocation(table, cellId);
  if (!loc || tableHasMergedColumns(table)) return table;
  const from = loc.columnIndex;
  const to = from + direction;
  if (to < 0 || to >= table.columns.length) return table;
  const columns = [...table.columns];
  [columns[from], columns[to]] = [columns[to], columns[from]];
  const moveCells = (row: TableRow): TableRow => {
    const cells = [...row.cells];
    if (cells.length > Math.max(from, to)) [cells[from], cells[to]] = [cells[to], cells[from]];
    return { ...row, cells };
  };
  return mapEveryTableRow({ ...table, columns }, moveCells);
}

export function updateTableRow(table: TableDefinition, rowId: string, patch: Partial<Omit<TableRow, 'cells' | 'id'>>): TableDefinition {
  const apply = (rows: TableRow[]) => rows.map((row) => row.id === rowId ? { ...row, ...patch } : row);
  return { ...table, headerRows: apply(table.headerRows), bodyRows: apply(table.bodyRows), customRows: apply(table.customRows), rows: apply(table.rows) };
}

export function updateTableColumn(table: TableDefinition, columnId: string, patch: Partial<Omit<TableColumn, 'id'>>): TableDefinition {
  return { ...table, columns: table.columns.map((column) => column.id === columnId ? { ...column, ...patch, format: patch.format ? { ...(column.format ?? {}), ...patch.format } : column.format } : column) };
}

/** DB-4P Fix1: set a direct/manual width hint while keeping page auto-fit. */
export function setTableColumnManualWidth(table: TableDefinition, columnId: string, width: number): TableDefinition {
  return updateTableColumn(table, columnId, { width: Math.max(24, Math.min(1000, width)), manualWidth: true });
}

/** Return a table to content-aware automatic sizing. */
export function resetTableColumnAutoWidth(table: TableDefinition, columnId?: string): TableDefinition {
  return { ...table, columns: table.columns.map((column) => (!columnId || column.id === columnId) ? { ...column, manualWidth: false } : column) };
}

/** Give all columns equal manual weights without changing the table's total width. */
export function equalizeTableColumnWidths(table: TableDefinition): TableDefinition {
  return { ...table, columns: table.columns.map((column) => ({ ...column, width: 120, manualWidth: true })) };
}


export function normalizedColumnWidths(columns: TableColumn[]): number[] {
  if (columns.length === 0) return [];
  const weights = columns.map((column) => {
    const raw = Number.isFinite(column.width) && column.width > 0 ? column.width : 1;
    return Math.max(1, raw);
  });
  const total = weights.reduce((sum, value) => sum + value, 0) || columns.length;
  return weights.map((value) => (value / total) * 100);
}


function visualCellAtColumn(row: TableRow | undefined, columnIndex: number): TableCell | undefined {
  if (!row) return undefined;
  let visual = 0;
  for (const cell of row.cells) {
    const span = Math.max(1, cell.colSpan);
    if (columnIndex >= visual && columnIndex < visual + span) return span === 1 ? cell : undefined;
    visual += span;
  }
  return undefined;
}

function compactValueText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

/** DB-4.2 Fix5: content-aware width distribution while always fitting 100%. */
export function isTableGapColumn(table: TableDefinition, columnIndex: number): boolean {
  const rows = [...table.headerRows, ...table.bodyRows, ...table.customRows, ...table.rows];
  if (!rows.length) return false;
  let seen = false;
  for (const row of rows) {
    const cell = visualCellAtColumn(row, columnIndex);
    if (!cell) continue;
    seen = true;
    const hasContent = Boolean(
      cell.content?.trim() ||
      cell.binding?.trim() ||
      cell.formula?.trim() ||
      cell.summaryFormula?.trim() ||
      cell.summaryName?.trim() ||
      cell.aggregate?.field?.trim() ||
      cell.imageSource?.trim() ||
      cell.imageAssetId?.trim() ||
      cell.type === 'image'
    );
    if (hasContent) return false;
  }
  return seen;
}

/**
 * UX-8.4 Fix1: preserve intentional table spacing when conditional columns disappear.
 * The full-table width plan remains the baseline. Hidden width is absorbed by nearby
 * content columns, while structural blank/gap columns keep their designed percentage.
 */
export function stableConditionalColumnWidths(
  table: TableDefinition,
  visibleIndexes: number[],
  runtimeValues: unknown[] = [],
): number[] {
  if (!visibleIndexes.length) return [];
  const full = smartColumnWidths(table, runtimeValues);
  if (visibleIndexes.length === table.columns.length) return full;
  const visibleSet = new Set(visibleIndexes);
  const result = new Map<number, number>(visibleIndexes.map((index) => [index, full[index] ?? 0]));
  const contentVisible = visibleIndexes.filter((index) => !isTableGapColumn(table, index));
  const recipientPool = contentVisible.length ? contentVisible : visibleIndexes;

  for (let hiddenIndex = 0; hiddenIndex < table.columns.length; hiddenIndex += 1) {
    if (visibleSet.has(hiddenIndex)) continue;
    const freed = full[hiddenIndex] ?? 0;
    if (freed <= 0) continue;
    const recipient = [...recipientPool].sort((a, b) => {
      const da = Math.abs(a - hiddenIndex);
      const db = Math.abs(b - hiddenIndex);
      if (da !== db) return da - db;
      // Prefer the right-hand content column on ties so financial/total columns
      // naturally absorb a hidden predecessor without moving a spacer.
      return (a >= hiddenIndex ? 0 : 1) - (b >= hiddenIndex ? 0 : 1);
    })[0];
    if (recipient !== undefined) result.set(recipient, (result.get(recipient) ?? 0) + freed);
  }

  const widths = visibleIndexes.map((index) => result.get(index) ?? 0);
  const sum = widths.reduce((total, value) => total + value, 0);
  if (sum <= 0) return visibleIndexes.map(() => 100 / visibleIndexes.length);
  return widths.map((value) => (value / sum) * 100);
}

export function smartColumnWidths(table: TableDefinition, runtimeValues: unknown[] = []): number[] {
  const columns = table.columns;
  if (columns.length === 0) return [];
  const designRows = table.mode === 'custom'
    ? [...table.headerRows, ...table.rows, ...table.customRows]
    : [...table.headerRows, ...table.bodyRows, ...table.customRows];
  const samples = runtimeValues.slice(0, 40);

  const scores = columns.map((column, columnIndex) => {
    const texts: string[] = [column.label || column.key || ''];
    for (const row of designRows) {
      const cell = visualCellAtColumn(row, columnIndex);
      if (cell?.content) texts.push(cell.content);
    }
    const bodyCell = visualCellAtColumn(table.bodyRows[0], columnIndex);
    if (bodyCell?.binding) {
      for (const row of samples) texts.push(compactValueText(valueAtPath(row, bodyCell.binding)));
    }

    const meaningful = texts.filter(Boolean);
    const valueTexts = meaningful.slice(1);
    const maxChars = meaningful.reduce((max, text) => Math.max(max, Math.min(34, text.length)), 0);
    const numericLike = valueTexts.length > 0 && valueTexts.every((text) => /^[-+]?[$₹€£]?\s*[0-9][0-9,.:/%-]*$/.test(text.trim()));
    const contentWidth = numericLike
      ? Math.max(52, Math.min(116, 22 + maxChars * 6.1))
      : Math.max(60, Math.min(220, 26 + maxChars * 6.4));
    const manualHint = Math.max(40, Math.min(240, Number.isFinite(column.width) ? column.width : 120));
    const minHint = Math.max(36, Math.min(160, Number.isFinite(column.minWidth) ? column.minWidth : 40));
    return Math.max(minHint, column.manualWidth ? manualHint : (contentWidth * 0.8 + manualHint * 0.2));
  });

  const total = scores.reduce((sum, value) => sum + value, 0) || scores.length;
  return scores.map((value) => (value / total) * 100);
}

export function findArrayPaths(record: NormalizedRecord | null): string[] {
  if (!record) return [];
  const found: string[] = [];
  const walk = (value: NormalizedValue, path: string) => {
    if (Array.isArray(value)) {
      found.push(path);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value as NormalizedRecord)) walk(child, path ? `${path}.${key}` : key);
    }
  };
  walk(record, '');
  return found.filter(Boolean);
}

export function valueAtPath(value: unknown, path: string | undefined): unknown {
  if (!path) return value;
  let current: unknown = value;
  for (const part of path.split('.').filter(Boolean)) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}



export function suggestedDataType(field: FieldDefinition | undefined): TableDataType {
  if (!field) return 'text';
  if (field.type === 'number') return 'decimal';
  if (field.type === 'boolean') return 'checkbox';
  if (field.type === 'date') return 'date';
  if (field.type === 'datetime') return 'datetime';
  return 'text';
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/[,\s₹$€£%]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

type ParsedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

function validDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

function fromExcelSerial(serial: number): ParsedDateParts | null {
  if (!Number.isFinite(serial) || serial < 0 || serial > 2958465) return null;
  // Excel's 1900 date system is represented reliably by using 1899-12-30 as day zero.
  const wholeDays = Math.floor(serial);
  const fraction = serial - wholeDays;
  const millis = Math.round(fraction * 86400000);
  const date = new Date(Date.UTC(1899, 11, 30) + wholeDays * 86400000 + millis);
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
    hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds(), millisecond: date.getUTCMilliseconds(),
  };
}

function dateValue(value: unknown): ParsedDateParts | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate(),
      hour: value.getHours(), minute: value.getMinutes(), second: value.getSeconds(), millisecond: value.getMilliseconds(),
    };
  }
  if (typeof value === 'number') return fromExcelSerial(value);
  if (typeof value !== 'string') return null;

  const text = value.trim();
  if (!text) return null;

  // Preserve the source's literal wall-clock components instead of converting timezone offsets.
  // This is important for document fields such as invoice dates/times and for Excel-normalized ISO values.
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (iso) {
    const year = Number(iso[1]); const month = Number(iso[2]); const day = Number(iso[3]);
    if (!validDateParts(year, month, day)) return null;
    return {
      year, month, day,
      hour: Number(iso[4] ?? 0), minute: Number(iso[5] ?? 0), second: Number(iso[6] ?? 0),
      millisecond: Number(String(iso[7] ?? '').padEnd(3, '0') || 0),
    };
  }

  const slashDate = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (slashDate) {
    const first = Number(slashDate[1]); const second = Number(slashDate[2]); const year = Number(slashDate[3]);
    // Prefer DD/MM/YYYY for ambiguous document data; unambiguous US-style dates still parse correctly.
    let day = first; let month = second;
    if (first <= 12 && second > 12) { month = first; day = second; }
    if (!validDateParts(year, month, day)) return null;
    let hour = Number(slashDate[4] ?? 0);
    const minute = Number(slashDate[5] ?? 0); const secondPart = Number(slashDate[6] ?? 0);
    const ampm = slashDate[7]?.toUpperCase();
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return { year, month, day, hour, minute, second: secondPart, millisecond: 0 };
  }

  const timeOnly = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (timeOnly) {
    let hour = Number(timeOnly[1]); const minute = Number(timeOnly[2]); const second = Number(timeOnly[3] ?? 0);
    const ampm = timeOnly[4]?.toUpperCase();
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return { year: 1970, month: 1, day: 1, hour, minute, second, millisecond: 0 };
  }

  if (/^\d+(?:\.\d+)?$/.test(text)) return fromExcelSerial(Number(text));

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    year: parsed.getFullYear(), month: parsed.getMonth() + 1, day: parsed.getDate(),
    hour: parsed.getHours(), minute: parsed.getMinutes(), second: parsed.getSeconds(), millisecond: parsed.getMilliseconds(),
  };
}

function dateParts(date: ParsedDateParts, format: TableDataFormat): string {
  const dd = String(date.day).padStart(2, '0');
  const mm = String(date.month).padStart(2, '0');
  const yyyy = String(date.year);
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.month - 1] ?? '';
  switch (format.dateFormat ?? 'dd/MM/yyyy') {
    case 'MM/dd/yyyy': return `${mm}/${dd}/${yyyy}`;
    case 'yyyy-MM-dd': return `${yyyy}-${mm}-${dd}`;
    case 'dd MMM yyyy': return `${dd} ${mon} ${yyyy}`;
    default: return `${dd}/${mm}/${yyyy}`;
  }
}

function timeParts(date: ParsedDateParts, format: TableDataFormat): string {
  if ((format.timeFormat ?? '12h') === '24h') {
    return `${String(date.hour).padStart(2, '0')}:${String(date.minute).padStart(2, '0')}`;
  }
  let hour = date.hour;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${String(hour).padStart(2, '0')}:${String(date.minute).padStart(2, '0')} ${suffix}`;
}

export function formatTableValue(value: unknown, dataType: TableDataType = 'text', format: TableDataFormat = {}): string {
  if (value == null || value === '') return format.nullDisplay ?? '';
  if (dataType === 'checkbox') {
    const truthy = typeof value === 'string' ? ['true', '1', 'yes', 'y', 'checked'].includes(value.trim().toLowerCase()) : Boolean(value);
    if ((format.checkboxStyle ?? 'checkbox') === 'labels') return truthy ? (format.trueValue ?? 'Yes') : (format.falseValue ?? 'No');
    return truthy ? '☑' : '☐';
  }
  if (dataType === 'date' || dataType === 'datetime' || dataType === 'time') {
    const date = dateValue(value);
    if (!date) return String(value);
    if (dataType === 'date') return dateParts(date, format);
    if (dataType === 'time') return timeParts(date, format);
    return `${dateParts(date, format)} ${timeParts(date, format)}`;
  }
  if (['number', 'decimal', 'currency', 'percentage'].includes(dataType)) {
    const numeric = numericValue(value);
    if (numeric == null) return String(value);
    const decimals = dataType === 'number' ? 0 : Math.max(0, Math.min(8, format.decimals ?? (dataType === 'percentage' ? 2 : 2)));
    const normalized = dataType === 'percentage' && (format.percentInputMode ?? 'fraction') === 'fraction' ? numeric * 100 : numeric;
    const formatted = new Intl.NumberFormat('en-IN', {
      useGrouping: format.thousandsSeparator !== false,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(normalized);
    if (dataType === 'currency') return `${format.currencySymbol ?? (format.currencyCode ? `${format.currencyCode} ` : '₹')}${formatted}`;
    if (dataType === 'percentage') return `${formatted}%`;
    return formatted;
  }
  return typeof value === 'string' ? value : String(value);
}

type FormulaToken = { type: 'number' | 'identifier' | 'operator' | 'paren' | 'comma'; value: string };

export type FormulaEvaluationOptions = { percentageFields?: Record<string, { inputMode?: 'fraction' | 'whole' }> };

function tokenizeFormula(expression: string, knownFields: string[] = []): FormulaToken[] {
  const tokens: FormulaToken[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) { index += 1; continue; }
    if (char === '[') {
      const end = expression.indexOf(']', index + 1);
      if (end < 0) throw new Error('Missing closing ] in formula field reference');
      const field = expression.slice(index + 1, end).trim();
      if (!field) throw new Error('Empty formula field reference');
      tokens.push({ type: 'identifier', value: field }); index = end + 1; continue;
    }
    const knownField = knownFields.find((field) => expression.slice(index, index + field.length) === field);
    if (knownField) {
      tokens.push({ type: 'identifier', value: knownField }); index += knownField.length; continue;
    }
    if (/[0-9.]/.test(char)) {
      let end = index + 1;
      while (end < expression.length && /[0-9.]/.test(expression[end])) end += 1;
      tokens.push({ type: 'number', value: expression.slice(index, end) }); index = end; continue;
    }
    if (/[A-Za-z_$]/.test(char)) {
      let end = index + 1;
      while (end < expression.length && /[A-Za-z0-9_.$]/.test(expression[end])) end += 1;
      tokens.push({ type: 'identifier', value: expression.slice(index, end) }); index = end; continue;
    }
    if ('+-*/'.includes(char)) { tokens.push({ type: 'operator', value: char }); index += 1; continue; }
    if ('()'.includes(char)) { tokens.push({ type: 'paren', value: char }); index += 1; continue; }
    if (char === ',') { tokens.push({ type: 'comma', value: char }); index += 1; continue; }
    throw new Error(`Unsupported formula token: ${char}`);
  }
  return tokens;
}


export type TableFormulaColumnReference = { columnId: string; label: string; dataType: TableDataType; reference: string };


function bracketBareFormulaReferences(expression: string, references: string[]): string {
  if (!expression?.trim() || references.length === 0) return expression;
  const candidates = Array.from(new Set(references.map((value) => value.trim()).filter(Boolean)))
    .sort((a, b) => b.length - a.length);
  let output = '';
  let index = 0;
  while (index < expression.length) {
    if (expression[index] === '[') {
      const end = expression.indexOf(']', index + 1);
      if (end >= 0) {
        output += expression.slice(index, end + 1);
        index = end + 1;
        continue;
      }
    }
    let matched = false;
    for (const reference of candidates) {
      if (expression.slice(index, index + reference.length).toLocaleLowerCase() !== reference.toLocaleLowerCase()) continue;
      const before = index > 0 ? expression[index - 1] : '';
      const after = expression[index + reference.length] ?? '';
      if (before && /[A-Za-z0-9_.$]/.test(before)) continue;
      if (after && /[A-Za-z0-9_.$]/.test(after)) continue;
      let lookahead = index + reference.length;
      while (/\s/.test(expression[lookahead] ?? '')) lookahead += 1;
      // A name immediately followed by '(' is a function call, not a column reference.
      if (expression[lookahead] === '(') continue;
      output += `[${reference}]`;
      index += reference.length;
      matched = true;
      break;
    }
    if (!matched) {
      output += expression[index];
      index += 1;
    }
  }
  return output;
}

/**
 * Normalize bare references to calculated table columns before persistence.
 * Example: `[Basic Value] - Discount` becomes `[Basic Value] - [Discount]`.
 * Function calls such as `DISCOUNT(...)` are left unchanged.
 */
export function normalizeTableFormulaReferences(table: TableDefinition): TableDefinition {
  if (table.mode !== 'dynamic') return table;
  const body = table.bodyRows[0];
  if (!body) return table;
  const calculatedNames: string[] = [];
  let visualColumn = 0;
  for (const cell of body.cells) {
    const column = table.columns[visualColumn];
    visualColumn += Math.max(1, cell.colSpan);
    if (!column) continue;
    const mode = cell.valueMode ?? (cell.binding ? 'binding' : 'custom');
    if (mode !== 'formula') continue;
    if (column.label?.trim()) calculatedNames.push(column.label.trim());
    if (column.key?.trim() && column.key !== column.label) calculatedNames.push(column.key.trim());
  }
  if (calculatedNames.length === 0) return table;
  const normalizeCell = (cell: TableCell): TableCell => ({
    ...cell,
    formula: cell.formula ? bracketBareFormulaReferences(cell.formula, calculatedNames) : cell.formula,
    summaryFormula: cell.summaryFormula ? bracketBareFormulaReferences(cell.summaryFormula, calculatedNames) : cell.summaryFormula,
  });
  const normalizeRow = (row: TableRow): TableRow => ({ ...row, cells: row.cells.map(normalizeCell) });
  return {
    ...table,
    bodyRows: table.bodyRows.map(normalizeRow),
    customRows: table.customRows.map(normalizeRow),
    rows: table.rows.map(normalizeRow),
    binding: table.binding?.grouping ? {
      ...table.binding,
      grouping: {
        ...table.binding.grouping,
        columns: table.binding.grouping.columns.map((column) => column.operation === 'formula' && column.formula
          ? { ...column, formula: bracketBareFormulaReferences(column.formula, calculatedNames) }
          : column),
      },
    } : table.binding,
  };
}

export function formulaColumnReferences(table: TableDefinition, currentColumnId?: string): TableFormulaColumnReference[] {
  if (table.mode !== 'dynamic') return [];
  const body = table.bodyRows[0];
  if (!body) return [];
  const refs: TableFormulaColumnReference[] = [];
  let visualColumn = 0;
  for (const cell of body.cells) {
    const column = table.columns[visualColumn];
    visualColumn += Math.max(1, cell.colSpan);
    if (!column || column.id === currentColumnId) continue;
    const mode = cell.valueMode ?? (cell.binding ? 'binding' : 'custom');
    if (mode !== 'formula') continue;
    const label = column.label?.trim() || column.key?.trim() || `Column ${refs.length + 1}`;
    refs.push({ columnId: column.id, label, dataType: cell.dataType ?? column.dataType ?? 'number', reference: /^[A-Za-z_$][A-Za-z0-9_.$]*$/.test(label) ? label : `[${label}]` });
  }
  return refs;
}

function formulaReferenceNames(expression: string | undefined): Set<string> {
  const refs = new Set<string>();
  if (!expression) return refs;
  for (const match of expression.matchAll(/\[([^\]]+)\]/g)) {
    const name = match[1]?.trim(); if (name) refs.add(name);
  }
  const scrubbed = expression.replace(/\[[^\]]+\]/g, ' ');
  for (const match of scrubbed.matchAll(/[A-Za-z_$][A-Za-z0-9_.$]*/g)) refs.add(match[0]);
  return refs;
}

/**
 * Resolve Dynamic Table formula columns for one runtime row.
 * Results are keyed by stable column id. Formula-column labels/keys are exposed to
 * later formulas, so `[Net Value] + [Tax Amount]` can chain safely. Evaluation uses
 * bounded dependency passes; unresolved self/circular references stay null.
 */
export function evaluateTableFormulaColumns(table: TableDefinition, record: unknown): Record<string, number | null> {
  if (table.mode !== 'dynamic' || !record || typeof record !== 'object') return {};
  const body = table.bodyRows[0];
  if (!body) return {};

  const context: Record<string, unknown> = { ...(record as Record<string, unknown>) };
  const percentageFields: Record<string, { inputMode?: 'fraction' | 'whole' }> = {};
  const specs: Array<{ column: TableColumn; cell: TableCell; label: string }> = [];
  let visualColumn = 0;
  for (const cell of body.cells) {
    const column = table.columns[visualColumn];
    visualColumn += Math.max(1, cell.colSpan);
    if (!column) continue;
    const type = cell.dataType ?? column.dataType;
    if (cell.binding && type === 'percentage') percentageFields[cell.binding] = { inputMode: cell.format?.percentInputMode ?? column.format?.percentInputMode ?? 'fraction' };
    const mode = cell.valueMode ?? (cell.binding ? 'binding' : 'custom');
    if (mode === 'formula') {
      const label = column.label?.trim() || column.key?.trim() || column.id;
      specs.push({ column, cell, label });
      if (type === 'percentage') {
        const pct = { inputMode: cell.format?.percentInputMode ?? column.format?.percentInputMode ?? 'fraction' } as const;
        percentageFields[label] = pct;
        if (column.key) percentageFields[column.key] = pct;
      }
    }
  }

  const results: Record<string, number | null> = Object.fromEntries(specs.map(({ column }) => [column.id, null]));
  const unresolved = new Set(specs.map(({ column }) => column.id));
  for (let pass = 0; pass < specs.length && unresolved.size > 0; pass += 1) {
    let progressed = false;
    for (const spec of specs) {
      if (!unresolved.has(spec.column.id)) continue;
      const refs = formulaReferenceNames(spec.cell.formula);
      if (refs.has(spec.label) || (!!spec.column.key && refs.has(spec.column.key))) continue;
      const result = evaluateTableFormula(spec.cell.formula, context, { percentageFields });
      if (result == null) continue;
      results[spec.column.id] = result;
      context[spec.label] = result;
      if (spec.column.key) context[spec.column.key] = result;
      unresolved.delete(spec.column.id);
      progressed = true;
    }
    if (!progressed) break;
  }
  return results;
}

export function evaluateTableFormula(expression: string | undefined, record: unknown, options: FormulaEvaluationOptions = {}): number | null {
  if (!expression?.trim()) return null;
  try {
    const knownFields = record && typeof record === 'object' ? Object.keys(record as Record<string, unknown>).sort((a, b) => b.length - a.length) : [];
    const tokens = tokenizeFormula(expression, knownFields);
    let cursor = 0;
    const parseFactor = (): number => {
      const token = tokens[cursor++];
      if (!token) throw new Error('Unexpected end of formula');
      if (token.type === 'operator' && (token.value === '+' || token.value === '-')) {
        const value = parseFactor(); return token.value === '-' ? -value : value;
      }
      if (token.type === 'paren' && token.value === '(') {
        const value = parseExpression();
        const close = tokens[cursor++];
        if (!close || close.type !== 'paren' || close.value !== ')') throw new Error('Missing closing parenthesis');
        return value;
      }
      if (token.type === 'number') {
        const parsed = Number(token.value); if (!Number.isFinite(parsed)) throw new Error('Invalid number'); return parsed;
      }
      if (token.type === 'identifier') {
        if (token.value.toUpperCase() === 'DISCOUNT' && tokens[cursor]?.type === 'paren' && tokens[cursor]?.value === '(') {
          cursor += 1;
          const base = parseExpression();
          const comma = tokens[cursor++];
          if (!comma || comma.type !== 'comma') throw new Error('DISCOUNT requires amount and discount rate');
          const rateInput = parseExpression();
          const close = tokens[cursor++];
          if (!close || close.type !== 'paren' || close.value !== ')') throw new Error('Missing closing parenthesis');
          const rate = Math.abs(rateInput) > 1 ? rateInput / 100 : rateInput;
          return base - (base * rate);
        }
        const sourceValue = valueAtPath(record, token.value);
        const parsed = numericValue(sourceValue);
        if (parsed == null) throw new Error(`Field ${token.value} is not numeric`);
        const percentage = options.percentageFields?.[token.value];
        if (percentage) {
          if (typeof sourceValue === 'string' && sourceValue.includes('%')) return parsed / 100;
          return percentage.inputMode === 'whole' ? parsed / 100 : parsed;
        }
        return parsed;
      }
      throw new Error('Invalid formula');
    };
    const parseTerm = (): number => {
      let value = parseFactor();
      while (tokens[cursor]?.type === 'operator' && ['*', '/'].includes(tokens[cursor].value)) {
        const op = tokens[cursor++].value;
        const right = parseFactor();
        if (op === '/' && right === 0) throw new Error('Divide by zero');
        value = op === '*' ? value * right : value / right;
      }
      return value;
    };
    const parseExpression = (): number => {
      let value = parseTerm();
      while (tokens[cursor]?.type === 'operator' && ['+', '-'].includes(tokens[cursor].value)) {
        const op = tokens[cursor++].value;
        const right = parseTerm();
        value = op === '+' ? value + right : value - right;
      }
      return value;
    };
    const result = parseExpression();
    if (cursor !== tokens.length || !Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}


export type TableSummaryResult = { byCellId: Record<string, unknown>; byName: Record<string, number> };

function formulaColumnContext(table: TableDefinition, record: unknown): Record<string, unknown> {
  const context: Record<string, unknown> = record && typeof record === 'object' ? { ...(record as Record<string, unknown>) } : {};
  const results = evaluateTableFormulaColumns(table, record);
  const body = table.bodyRows[0];
  if (!body) return context;
  let visualColumn = 0;
  for (const cell of body.cells) {
    const column = table.columns[visualColumn];
    visualColumn += Math.max(1, cell.colSpan);
    if (!column) continue;
    const result = results[column.id];
    if (result == null) continue;
    const label = column.label?.trim() || column.key?.trim();
    if (label) context[label] = result;
    if (column.key) context[column.key] = result;
  }
  return context;
}

function aggregateValues(rows: Array<Record<string, unknown>>, field: string, operation: TableAggregateOperation): number {
  const values = rows.map((row) => valueAtPath(row, field)).filter((value) => value !== undefined && value !== null && value !== '');
  if (operation === 'count') return values.length;
  const nums = values.map(numericValue).filter((value): value is number => value != null && Number.isFinite(value));
  if (operation === 'sum') return nums.reduce((sum, value) => sum + value, 0);
  if (operation === 'avg') return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
  if (operation === 'min') return nums.length ? Math.min(...nums) : 0;
  return nums.length ? Math.max(...nums) : 0;
}

function replaceAggregateCalls(expression: string, rows: Array<Record<string, unknown>>): string {
  return expression.replace(/\b(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*(?:\[([^\]]+)\]|([A-Za-z_$][A-Za-z0-9_.$]*))\s*\)/gi, (_full, op, bracketField, bareField) => {
    const field = String(bracketField || bareField || '').trim();
    const value = aggregateValues(rows, field, String(op).toLowerCase() as TableAggregateOperation);
    return String(value);
  });
}

/**
 * DB-4.3B summary engine. Runtime records are first enriched with resolved formula-column
 * values, so SUM([Net Value]) and similar aggregates work naturally. Summary rows resolve
 * top-to-bottom, exposing named results to later rows (e.g. [Subtotal] + [Tax Amount]).
 */
export function evaluateTableSummaryRows(table: TableDefinition, runtimeRecords: unknown[], scalarContext: Record<string, unknown> = {}): TableSummaryResult {
  const rows = runtimeRecords.map((record) => formulaColumnContext(table, record));
  const byCellId: Record<string, unknown> = {};
  const byName: Record<string, number> = {};

  for (const row of table.customRows) {
    for (const cell of row.cells) {
      const mode = cell.summaryMode ?? 'custom';
      if (mode === 'aggregate') {
        const operation = cell.aggregate?.operation ?? 'sum';
        const field = cell.aggregate?.field?.trim() ?? '';
        if (!field) { byCellId[cell.id] = null; continue; }
        const value = aggregateValues(rows, field, operation);
        byCellId[cell.id] = value;
        const name = cell.summaryName?.trim();
        if (name) byName[name] = value;
        continue;
      }
      if (mode === 'formula') {
        const expression = replaceAggregateCalls(cell.summaryFormula ?? '', rows);
        const value = evaluateTableFormula(expression, { ...scalarContext, ...byName });
        byCellId[cell.id] = value;
        const name = cell.summaryName?.trim();
        if (name && value != null) byName[name] = value;
      }
    }
  }
  return { byCellId, byName };
}

export function summaryFieldOptions(table: TableDefinition, source?: BuilderDataSource | null): Array<{ value: string; label: string; kind: 'field' | 'formula' }> {
  const options: Array<{ value: string; label: string; kind: 'field' | 'formula' }> = [];
  for (const field of source?.fields ?? []) options.push({ value: field.name, label: field.label || field.name, kind: 'field' });
  for (const formula of formulaColumnReferences(table)) options.push({ value: formula.label, label: formula.label, kind: 'formula' });
  return options;
}

export function summaryValueReferences(table: TableDefinition, currentCellId?: string): Array<{ name: string; reference: string }> {
  const refs: Array<{ name: string; reference: string }> = [];
  for (const row of table.customRows) for (const cell of row.cells) {
    if (cell.id === currentCellId) continue;
    const name = cell.summaryName?.trim();
    if (!name || (cell.summaryMode !== 'aggregate' && cell.summaryMode !== 'formula')) continue;
    refs.push({ name, reference: /^[A-Za-z_$][A-Za-z0-9_.$]*$/.test(name) ? name : `[${name}]` });
  }
  return refs;
}

export function recommendedRowKey(fields: FieldDefinition[]): string {
  const preferred = ['id', 'lineitemid', 'lineitemno', 'line_item_id', 'line_item_no', 'uuid', 'guid', 'sku', 'productcode', 'product_code', 'code'];
  const byName = new Map(fields.map((field) => [field.name.toLowerCase(), field.name]));
  for (const key of preferred) {
    const match = byName.get(key);
    if (match) return match;
  }
  return '';
}


export function recommendedParentKey(fields: FieldDefinition[]): string {
  const preferred = ['invoiceid', 'invoiceno', 'invoice_no', 'orderno', 'order_no', 'orderid', 'quotationno', 'quotation_no', 'documentid', 'documentno'];
  const byName = new Map(fields.map((field) => [field.name.toLowerCase(), field.name]));
  for (const key of preferred) {
    const match = byName.get(key);
    if (match) return match;
  }
  return '';
}

function configuredKeys(primary: string | undefined, composite: string[] | undefined): string[] {
  if (Array.isArray(composite) && composite.filter(Boolean).length > 0) return composite.filter(Boolean);
  return primary ? [primary] : [];
}

export function compositeKey(value: unknown, keys: string[]): string | null {
  if (keys.length === 0) return null;
  const parts = keys.map((key) => valueAtPath(value, key));
  if (parts.some((part) => part == null || part === '')) return null;
  return parts.map((part) => String(part)).join('¦');
}

export function dynamicRows(
  table: TableDefinition,
  record: NormalizedRecord | null,
  source?: BuilderDataSource | null,
  parentSource?: BuilderDataSource | null,
  resolveDocumentField?: (field: string) => unknown,
): TablePaginationRuntimeRow[] {
  if (table.mode !== 'dynamic' || !table.binding?.repeatSource) return [];

  const raw: unknown = table.binding.sourceId && source?.id === table.binding.sourceId
    ? source.records
    : valueAtPath(record, table.binding.repeatSource);
  if (!Array.isArray(raw)) return [];

  let filtered = raw;

  // Primary flat-source model: restrict both Detail and Grouped Summary tables to the
  // currently selected Parent / Document before any grouping or aggregation happens.
  const parentKeys = configuredKeys(table.binding.parentKey, table.binding.parentKeys);
  if (parentKeys.length > 0 && source && record && !table.binding?.childForeignKey) {
    const selectedParentKey = compositeKey(record, parentKeys);
    if (!selectedParentKey) return [];
    filtered = raw.filter((item) => compositeKey(item, parentKeys) === selectedParentKey);
  } else {
    // Backward compatibility for the earlier separate Parent Source / Child Foreign Key schema.
    const { parentSourceId, parentKey, childForeignKey } = table.binding;
    if (parentSourceId && parentKey && childForeignKey) {
      const parentMatches = !parentSource || parentSource.id === parentSourceId;
      const parentValue = parentMatches ? valueAtPath(record, parentKey) : undefined;
      if (parentValue == null || parentValue === '') return [];
      filtered = raw.filter((item) => {
        const childValue = valueAtPath(item, childForeignKey);
        return childValue != null && String(childValue) === String(parentValue);
      });
    }
  }

  const rowCondition = normalizeConditionalRendering(table.rowConditionalRendering);
  if (rowCondition.enabled) {
    filtered = filtered.filter((item) => evaluateBuilderConditionalRendering(rowCondition, (field) => {
      const rowValue = valueAtPath(item, field);
      if (rowValue !== undefined) return rowValue;
      const resolved = resolveDocumentField?.(field);
      return resolved !== undefined ? resolved : valueAtPath(record, field);
    }));
  }

  const grouping = table.binding.grouping;
  if (grouping?.groupBy?.length && grouping.columns?.length) {
    return groupedRuntimeRows(table, filtered, grouping);
  }

  const rowKeys = configuredKeys(table.binding.rowKey, table.binding.rowKeys);
  return filtered.map((item, index) => {
    const configured = compositeKey(item, rowKeys);
    const rec = (item && typeof item === 'object' && !Array.isArray(item) ? item : { value: item }) as NormalizedRecord;
    return { key: configured == null ? `${table.id}::${index}` : `${table.id}::${configured}`, value: rec };
  });
}

export function visibleTableColumnIndexes(
  table: TableDefinition,
  documentRecord: NormalizedRecord | null,
  runtimeRows: TablePaginationRuntimeRow[],
  resolveDocumentField?: (field: string) => unknown,
): number[] {
  const documentResolver = (field: string) => {
    const resolved = resolveDocumentField?.(field);
    return resolved !== undefined ? resolved : valueAtPath(documentRecord, field);
  };
  return table.columns.flatMap((column, index) => {
    const condition = normalizeConditionalRendering(column.conditionalRendering);
    if (!condition.enabled) return [index];
    const scope = column.conditionScope ?? 'document';
    let visible = true;
    if (scope === 'document') visible = evaluateBuilderConditionalRendering(condition, documentResolver);
    else if (scope === 'anyRow') visible = runtimeRows.some((runtimeRow) => evaluateBuilderConditionalRendering(condition, (field) => {
      const rowValue = valueAtPath(runtimeRow.value, field);
      return rowValue !== undefined ? rowValue : documentResolver(field);
    }));
    else visible = runtimeRows.length > 0 && runtimeRows.every((runtimeRow) => evaluateBuilderConditionalRendering(condition, (field) => {
      const rowValue = valueAtPath(runtimeRow.value, field);
      return rowValue !== undefined ? rowValue : documentResolver(field);
    }));
    return visible ? [index] : [];
  });
}

export function projectTableVisibleColumns(table: TableDefinition, visibleIndexes: number[]): TableDefinition {
  if (visibleIndexes.length === table.columns.length) return table;
  const visible = new Set(visibleIndexes);
  const projectRow = (row: TableRow): TableRow => {
    let sourceColumn = 0;
    const cells: TableCell[] = [];
    for (const cell of row.cells) {
      const span = Math.max(1, cell.colSpan);
      const covered = Array.from({ length: span }, (_, offset) => sourceColumn + offset);
      const visibleCovered = covered.filter((index) => visible.has(index));
      sourceColumn += span;
      if (!visibleCovered.length) continue;
      cells.push({ ...cell, colSpan: visibleCovered.length });
    }
    return { ...row, cells };
  };
  return {
    ...table,
    columns: visibleIndexes.map((index) => table.columns[index]!).filter(Boolean),
    headerRows: table.headerRows.map(projectRow),
    bodyRows: table.bodyRows.map(projectRow),
    customRows: table.customRows.map(projectRow),
    rows: table.rows.map(projectRow),
    selectedCellId: table.selectedCellId && [...table.headerRows,...table.bodyRows,...table.customRows,...table.rows]
      .flatMap((row) => row.cells)
      .some((cell) => cell.id === table.selectedCellId) ? table.selectedCellId : undefined,
  };
}

function groupedRuntimeRows(table: TableDefinition, rows: unknown[], grouping: GroupedTableConfig): Array<{ key: string; value: NormalizedRecord }> {
  const buckets = new Map<string, unknown[]>();
  const order: string[] = [];
  for (const row of rows) {
    const key = compositeKey(row, grouping.groupBy);
    if (key == null) continue;
    if (!buckets.has(key)) { buckets.set(key, []); order.push(key); }
    buckets.get(key)!.push(row);
  }

  return order.map((groupKey) => {
    const items = buckets.get(groupKey) ?? [];
    const value: NormalizedRecord = {};
    const context: Record<string, unknown> = {};
    const formulaColumns: typeof grouping.columns = [];
    grouping.columns.forEach((column) => {
      if (column.operation === 'formula') {
        formulaColumns.push(column);
        value[column.outputKey] = null;
        return;
      }
      const result = groupedColumnValue(items, column.field, column.operation);
      value[column.outputKey] = result as NormalizedValue;
      const label = column.label?.trim();
      if (label) context[label] = result;
      if (column.field) context[column.field] = result;
    });
    // Keep the original group fields accessible for mixed tokens/formulas and diagnostics.
    const first = items[0];
    for (const field of grouping.groupBy) {
      const fieldValue = valueAtPath(first, field);
      if (fieldValue !== undefined) {
        value[field] = fieldValue as NormalizedValue;
        context[field] = fieldValue;
      }
    }

    // DB-4G Fix1: aggregate/group values resolve first, then formulas resolve in bounded
    // dependency passes. This supports chained grouped formulas while self/circular
    // references remain null instead of destabilising the runtime row.
    const unresolved = new Set(formulaColumns.map((column) => column.outputKey));
    for (let pass = 0; pass < formulaColumns.length && unresolved.size > 0; pass += 1) {
      let progressed = false;
      for (const column of formulaColumns) {
        if (!unresolved.has(column.outputKey)) continue;
        const label = column.label?.trim() || column.outputKey;
        const refs = formulaReferenceNames(column.formula);
        if (refs.has(label) || refs.has(column.outputKey)) continue;
        const result = evaluateTableFormula(column.formula, context);
        if (result == null) continue;
        value[column.outputKey] = result as NormalizedValue;
        context[label] = result;
        if (column.field) context[column.field] = result;
        unresolved.delete(column.outputKey);
        progressed = true;
      }
      if (!progressed) break;
    }
    return { key: `${table.id}::group::${groupKey}`, value };
  });
}

function groupedColumnValue(rows: unknown[], field: string, operation: GroupedAggregateOperation): unknown {
  if (operation === 'formula') return null;
  const values = rows.map((row) => valueAtPath(row, field)).filter((value) => value !== undefined && value !== null && value !== '');
  if (operation === 'group' || operation === 'first') return values[0] ?? '';
  if (operation === 'last') return values.length ? values[values.length - 1] : '';
  if (operation === 'count') return values.length;
  const numeric = values.map(numericValue).filter((value): value is number => value != null && Number.isFinite(value));
  if (operation === 'sum') return numeric.reduce((sum, value) => sum + value, 0);
  if (operation === 'avg') return numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : 0;
  if (operation === 'min') return numeric.length ? Math.min(...numeric) : 0;
  if (operation === 'max') return numeric.length ? Math.max(...numeric) : 0;
  return '';
}


// DB-4.4 Phase 3: deterministic pagination planner / materialized table page plan.
// The planner deliberately works in pixels because the builder preview already resolves
// physical page geometry to px. PDF/DOCX renderers can consume the same row ranges later.
export type TablePaginationRuntimeRow = { key: string; value: NormalizedRecord };
export type TablePaginationPage = {
  index: number;
  /** Stable identity for preview/export reconciliation. */
  id: string;
  runtimeRows: TablePaginationRuntimeRow[];
  /** Inclusive zero-based runtime row range. -1/-1 means no body rows on this page. */
  startRow: number;
  endRow: number;
  includeHeader: boolean;
  includeSummary: boolean;
  manualBreakBefore?: boolean;
  availableHeightPx: number;
  usedHeightPx: number;
  unusedHeightPx: number;
};

/**
 * Auto-height rows previously used the design-time 30/32px handle height for pagination,
 * while the browser often renders a compact one-line row closer to 22-26px. Across a long
 * invoice that accumulated into a large false blank area before the footer. Estimate the
 * actual one-line CSS height from cell typography/padding, while fixed-height rows continue
 * to use their explicit height.
 */
function rowEstimatedHeight(row: TableRow): number {
  if (!row.autoHeight) return Math.max(18, row.height);
  let estimated = 18;
  for (const cell of row.cells) {
    const fontSize = Math.max(6, cell.style.fontSize || 11);
    const padding = Math.max(0, cell.style.padding ?? 0);
    // CSS .db-table td uses line-height:1.25 and a 1px-ish collapsed border.
    estimated = Math.max(estimated, Math.ceil(fontSize * 1.25 + padding * 2 + 2));
  }
  return estimated;
}


/** DB-4.4 Phase 3 Fix3: estimate the rendered height of a repeated runtime row.
 * Auto-height rows can wrap differently for every record (for example a long
 * Product Description). Pagination must therefore reserve the height of the
 * actual runtime value, not only the one-line design template.
 */
function runtimeBodyHeight(table: TableDefinition, runtimeValue: unknown, tableWidthPx = 760): number {
  const widths = smartColumnWidths(table, [runtimeValue]);
  let total = 0;
  for (const row of table.bodyRows) {
    if (!row.autoHeight) { total += Math.max(18, row.height); continue; }
    let visualColumn = 0;
    let rowHeight = rowEstimatedHeight(row);
    for (const cell of row.cells) {
      const span = Math.max(1, cell.colSpan);
      const widthPercent = widths.slice(visualColumn, visualColumn + span).reduce((sum, value) => sum + value, 0);
      visualColumn += span;
      const cellWidthPx = Math.max(24, tableWidthPx * widthPercent / 100);
      const fontSize = Math.max(6, cell.style.fontSize || 11);
      const padding = Math.max(0, cell.style.padding ?? 0);
      const raw = cell.binding ? valueAtPath(runtimeValue, cell.binding) : cell.content;
      const text = compactValueText(raw);
      // Browser text width varies by font. 0.56em is a conservative average for
      // invoice/body text and keeps the last complete row out of the Footer.
      const usableWidth = Math.max(8, cellWidthPx - padding * 2 - 2);
      const charsPerLine = Math.max(1, Math.floor(usableWidth / Math.max(3.5, fontSize * 0.56)));
      const explicitLines = String(text || '').split(/\r?\n/);
      const lineCount = explicitLines.reduce((sum, line) => sum + Math.max(1, Math.ceil(Math.max(1, line.length) / charsPerLine)), 0);
      const estimated = Math.ceil(lineCount * fontSize * 1.25 + padding * 2 + 1);
      rowHeight = Math.max(rowHeight, estimated);
    }
    total += rowHeight;
  }
  return Math.max(18, total);
}

function paginationPageId(table: TableDefinition, index: number, rows: TablePaginationRuntimeRow[]) {
  const first = rows[0]?.key ?? 'empty';
  const last = rows[rows.length - 1]?.key ?? first;
  return `${table.id}::page-${index + 1}::${first}::${last}`;
}

export function paginateDynamicTable(
  table: TableDefinition,
  runtimeRows: TablePaginationRuntimeRow[],
  availableHeightPx: number,
  continuationHeightPx: number = availableHeightPx,
  tableWidthPx: number = 760,
): TablePaginationPage[] {
  const makeSinglePage = (): TablePaginationPage => {
    const available = Math.max(0, availableHeightPx);
    const used = table.headerRows.reduce((sum, row) => sum + rowEstimatedHeight(row), 0)
      + runtimeRows.length * Math.max(18, table.bodyRows.reduce((sum, row) => sum + rowEstimatedHeight(row), 0))
      + table.customRows.reduce((sum, row) => sum + rowEstimatedHeight(row), 0);
    return {
      index: 0, id: paginationPageId(table, 0, runtimeRows), runtimeRows,
      startRow: runtimeRows.length ? 0 : -1, endRow: runtimeRows.length ? runtimeRows.length - 1 : -1,
      includeHeader: true, includeSummary: true,
      availableHeightPx: available, usedHeightPx: used, unusedHeightPx: Math.max(0, available - used),
    };
  };

  if (table.mode !== 'dynamic') return [makeSinglePage()];
  if (table.pagination?.enabled === false || availableHeightPx <= 0) return [makeSinglePage()];

  const repeatHeader = table.pagination?.repeatHeader !== false;
  const repeatedHeaderRows = table.headerRows.filter((row) => row.repeatOnEveryPage !== false);
  const firstHeaderHeight = table.headerRows.reduce((sum, row) => sum + rowEstimatedHeight(row), 0);
  const repeatHeaderHeight = repeatHeader ? repeatedHeaderRows.reduce((sum, row) => sum + rowEstimatedHeight(row), 0) : 0;
  const defaultBodyHeight = Math.max(18, table.bodyRows.reduce((sum, row) => sum + rowEstimatedHeight(row), 0));
  const summaryHeight = table.customRows.reduce((sum, row) => sum + rowEstimatedHeight(row), 0);
  const manualBodyBreakBefore = table.bodyRows.some((row) => row.pageBreakBefore);
  const pages: TablePaginationPage[] = [];

  let currentRows: TablePaginationRuntimeRow[] = [];
  let currentStart = 0;
  let used = firstHeaderHeight;
  // Keep a small hard boundary reserve so collapsed borders/sub-pixel layout never enter the footer band.
  const PAGE_BOTTOM_GUARD_PX = 6;
  let capacity = Math.max(40, availableHeightPx - PAGE_BOTTOM_GUARD_PX);
  let currentIncludeHeader = true;
  let currentManualBreak = false;

  const commit = (includeSummary = false) => {
    const index = pages.length;
    const startRow = currentRows.length ? currentStart : -1;
    const endRow = currentRows.length ? currentStart + currentRows.length - 1 : -1;
    const usedHeightPx = used + (includeSummary ? summaryHeight : 0);
    pages.push({
      index,
      id: paginationPageId(table, index, currentRows),
      runtimeRows: currentRows,
      startRow,
      endRow,
      includeHeader: currentIncludeHeader,
      includeSummary,
      manualBreakBefore: currentManualBreak || undefined,
      availableHeightPx: capacity,
      usedHeightPx,
      unusedHeightPx: Math.max(0, capacity - usedHeightPx),
    });
    currentRows = [];
    currentStart = endRow + 1;
    currentIncludeHeader = repeatHeader;
    currentManualBreak = false;
    used = repeatHeaderHeight;
    capacity = Math.max(40, continuationHeightPx - PAGE_BOTTOM_GUARD_PX);
  };

  // A design-body page break is a break before the repeated body template, not "before every
  // runtime record". Apply it once before the first runtime row when the table already consumed
  // header space on page one; subsequent runtime rows pack normally.
  if (manualBodyBreakBefore && runtimeRows.length > 0 && firstHeaderHeight > 0) {
    currentManualBreak = true;
  }

  for (let i = 0; i < runtimeRows.length; i += 1) {
    const runtimeRow = runtimeRows[i];
    const bodyHeight = table.bodyRows.some((row) => row.autoHeight)
      ? runtimeBodyHeight(table, runtimeRow.value, tableWidthPx)
      : defaultBodyHeight;
    // Every complete runtime row must fit before the hard Body/Footer boundary.
    // Wrapped rows are measured from their runtime content, so a two-line Product
    // Description is moved intact instead of being clipped at the page edge.
    const wouldOverflow = used + bodyHeight > capacity;
    if (wouldOverflow && currentRows.length > 0) commit(false);
    if (currentRows.length === 0) currentStart = i;
    currentRows.push(runtimeRow);
    used += bodyHeight;
  }

  if (table.customRows.length > 0) {
    const manualSummaryBreak = table.customRows.some((row) => row.pageBreakBefore);
    const keepSummaryTogether = table.pagination?.keepSummaryTogether !== false;
    const summaryWouldOverflow = used + summaryHeight > capacity;
    if ((manualSummaryBreak || (keepSummaryTogether && summaryWouldOverflow)) && currentRows.length > 0) {
      commit(false);
      currentManualBreak = manualSummaryBreak;
    }
    // Summary-only final pages are allowed when the summary is explicitly kept together.
    commit(true);
  } else if (currentRows.length > 0 || pages.length === 0) {
    commit(false);
  }

  // Re-index/id after all commits so IDs remain deterministic even for summary-only pages.
  return pages.map((page, index) => ({
    ...page,
    index,
    id: paginationPageId(table, index, page.runtimeRows),
  }));
}
