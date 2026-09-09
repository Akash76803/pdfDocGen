import type { FieldDefinition, NormalizedRecord, NormalizedValue } from '@document-tool/contracts';
import type { BuilderDataSource } from './dataSourceStore.ts';

export type TableMode = 'dynamic' | 'custom';
export type TableCellType = 'text' | 'image' | 'qr' | 'barcode';
export type TableRowKind = 'header' | 'body' | 'custom';
export type TableAlign = 'left' | 'center' | 'right';

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
  cells: TableCell[];
};

export type TableColumn = {
  id: string;
  key: string;
  label: string;
  width: number;
  minWidth: number;
  maxWidth?: number;
  align: TableAlign;
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
    repeatHeader: boolean;
    allowRowSplit: boolean;
    keepRowsTogether: boolean;
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
  return { id: crypto.randomUUID(), type, content, imageFit: type === 'image' ? 'cover' : undefined, rowSpan: 1, colSpan: 1, style: defaultCellStyle() };
}

function createColumns(count: number): TableColumn[] {
  return Array.from({ length: Math.max(1, count) }, (_, index) => ({
    id: crypto.randomUUID(), key: `col${index + 1}`, label: `Column ${index + 1}`,
    width: 120, minWidth: 40, align: 'left' as TableAlign,
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
      if (kind === 'body') cell.binding = `col${columnIndex + 1}`;
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
    pagination: { repeatHeader: false, allowRowSplit: false, keepRowsTogether: true },
    borderWidth: 1, borderColor: '#cfd6df', defaultPadding: 5,
  };
}

export function createDynamicTable(columnCount: number, repeatSource: string, headerRowCount = 1, binding?: { sourceId?: string; rowKey?: string; rowKeys?: string[]; parentKey?: string; parentKeys?: string[]; parentSourceId?: string; childForeignKey?: string }): TableDefinition {
  const columns = createColumns(columnCount);
  const headerRows = Array.from({ length: Math.max(0, headerRowCount) }, () => createRow('header', columns.length));
  const bodyRows = [createRow('body', columns.length)];
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
    pagination: { repeatHeader: true, allowRowSplit: false, keepRowsTogether: true },
    borderWidth: 1, borderColor: '#cfd6df', defaultPadding: 5,
  };
}

export function addCustomSummaryRow(table: TableDefinition): TableDefinition {
  const row = createRow('custom', table.columns.length);
  if (row.cells.length > 1) {
    row.cells[0].content = 'Total';
    row.cells[0].style.bold = true;
    row.cells[0].colSpan = Math.max(1, row.cells.length - 1);
    row.cells = [row.cells[0], row.cells[row.cells.length - 1]];
    row.cells[1].content = '0.00';
    row.cells[1].style.bold = true;
    row.cells[1].style.align = 'right';
  }
  return { ...table, customRows: [...table.customRows, row], selectedCellId: row.cells[0]?.id };
}

export function updateTableCell(table: TableDefinition, cellId: string, patch: Partial<TableCell>): TableDefinition {
  const patchRows = (rows: TableRow[]) => rows.map((row) => ({ ...row, cells: row.cells.map((cell) => cell.id === cellId ? { ...cell, ...patch, style: patch.style ? { ...cell.style, ...patch.style } : cell.style } : cell) }));
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
  return { ...cell, id: crypto.randomUUID(), rowSpan: 1, colSpan: 1, style: { ...cell.style } };
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
  return { ...table, columns: table.columns.map((column) => column.id === columnId ? { ...column, ...patch } : column) };
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
