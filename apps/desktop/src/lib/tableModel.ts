import type { FieldDefinition, NormalizedRecord, NormalizedValue } from '@document-tool/contracts';
import type { BuilderDataSource } from './dataSourceStore.ts';

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
};

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
  defaultPadding: number;
  selectedCellId?: string;
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

function createRow(kind: TableRowKind, columns: number, index = 0): TableRow {
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
    borderWidth: 1, borderColor: '#cfd6df', defaultPadding: 5,
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
    borderWidth: 1, borderColor: '#cfd6df', defaultPadding: 5,
  };
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
  const insertionIndex = Math.max(0, Math.min(table.columns.length, baseIndex + (where === 'right' ? Math.max(1, loc?.cell.colSpan ?? 1) : 0)));
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

type FormulaToken = { type: 'number' | 'identifier' | 'operator' | 'paren'; value: string };

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
    throw new Error(`Unsupported formula token: ${char}`);
  }
  return tokens;
}


export type TableFormulaColumnReference = { columnId: string; label: string; dataType: TableDataType; reference: string };

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
export function evaluateTableSummaryRows(table: TableDefinition, runtimeRecords: unknown[]): TableSummaryResult {
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
        const value = evaluateTableFormula(expression, byName);
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
): Array<{ key: string; value: unknown }> {
  if (table.mode !== 'dynamic' || !table.binding?.repeatSource) return [];

  const raw: unknown = table.binding.sourceId && source?.id === table.binding.sourceId
    ? source.records
    : valueAtPath(record, table.binding.repeatSource);
  if (!Array.isArray(raw)) return [];

  let filtered = raw;

  // DB-4.1 Fix4 primary model: parent/document and child/row identity can come from the SAME flat source.
  // Example: InvoiceNo identifies one document; LineItemNo (or InvoiceNo+LineItemNo) identifies each repeated row.
  const parentKeys = configuredKeys(table.binding.parentKey, table.binding.parentKeys);
  if (parentKeys.length > 0 && source && record) {
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

  const rowKeys = configuredKeys(table.binding.rowKey, table.binding.rowKeys);
  return filtered.map((item, index) => {
    const configured = compositeKey(item, rowKeys);
    return { key: configured == null ? `${table.id}::${index}` : `${table.id}::${configured}`, value: item };
  });
}


// DB-4.4 Phase 1: deterministic pagination planner used by the builder preview and later renderers.
export type TablePaginationRuntimeRow = { key: string; value: NormalizedRecord };
export type TablePaginationPage = {
  index: number;
  runtimeRows: TablePaginationRuntimeRow[];
  includeHeader: boolean;
  includeSummary: boolean;
  manualBreakBefore?: boolean;
};

function rowEstimatedHeight(row: TableRow): number {
  return Math.max(18, row.autoHeight ? row.height : row.height);
}

export function paginateDynamicTable(
  table: TableDefinition,
  runtimeRows: TablePaginationRuntimeRow[],
  availableHeightPx: number,
  continuationHeightPx: number = availableHeightPx,
): TablePaginationPage[] {
  if (table.mode !== 'dynamic') return [{ index: 0, runtimeRows: [], includeHeader: true, includeSummary: true }];
  if (table.pagination?.enabled === false || availableHeightPx <= 0) {
    return [{ index: 0, runtimeRows, includeHeader: true, includeSummary: true }];
  }

  const repeatHeader = table.pagination?.repeatHeader !== false;
  const headerRows = table.headerRows.filter((row) => repeatHeader ? row.repeatOnEveryPage !== false : true);
  const firstHeaderHeight = table.headerRows.reduce((sum, row) => sum + rowEstimatedHeight(row), 0);
  const repeatHeaderHeight = headerRows.reduce((sum, row) => sum + rowEstimatedHeight(row), 0);
  const bodyHeight = Math.max(18, table.bodyRows.reduce((sum, row) => sum + rowEstimatedHeight(row), 0));
  const summaryHeight = table.customRows.reduce((sum, row) => sum + rowEstimatedHeight(row), 0);
  const manualBodyBreak = table.bodyRows.some((row) => row.pageBreakBefore);
  const pages: TablePaginationPage[] = [];
  let current: TablePaginationPage = { index: 0, runtimeRows: [], includeHeader: true, includeSummary: false };
  let used = firstHeaderHeight;
  let currentCapacity = availableHeightPx;

  const commit = (manualBreakBefore = false) => {
    pages.push(current);
    current = { index: pages.length, runtimeRows: [], includeHeader: repeatHeader, includeSummary: false, manualBreakBefore };
    used = repeatHeader ? repeatHeaderHeight : 0;
    currentCapacity = Math.max(40, continuationHeightPx);
  };

  for (let i = 0; i < runtimeRows.length; i += 1) {
    if (manualBodyBreak && current.runtimeRows.length > 0) commit(true);
    const rowHeight = bodyHeight;
    const wouldOverflow = current.runtimeRows.length > 0 && used + rowHeight > currentCapacity;
    if (wouldOverflow) commit(false);
    current.runtimeRows.push(runtimeRows[i]);
    used += rowHeight;
  }

  if (table.customRows.length > 0) {
    const manualSummaryBreak = table.customRows.some((row) => row.pageBreakBefore);
    const keepSummaryTogether = table.pagination?.keepSummaryTogether !== false;
    const summaryWouldOverflow = used + summaryHeight > currentCapacity;
    if ((manualSummaryBreak || (keepSummaryTogether && summaryWouldOverflow)) && current.runtimeRows.length > 0) commit(manualSummaryBreak);
    current.includeSummary = true;
  }

  if (pages.length === 0 || current.runtimeRows.length > 0 || current.includeSummary || runtimeRows.length === 0) pages.push(current);
  return pages.map((page, index) => ({ ...page, index }));
}
