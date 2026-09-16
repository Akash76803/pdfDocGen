import {
  getPageDimensions,
  type RenderBlock,
  type RenderBoxChildBlock,
  type RenderModel,
  type RenderRowChildBlock,
  type RequiredTextStyle,
  type TemplateDefinition,
} from '@document-tool/contracts';
import {
  buildEditableDocx,
  type EditableDocxBlock,
  type EditableDocxImageBlock,
  type EditableDocxLayoutCell,
  type EditableDocxLayoutRow,
  type EditableDocxPage,
  type EditableDocxTableBlock,
  type EditableDocxTableCell,
  type EditableTextStyle,
} from '@document-tool/renderer-docx';

const MM_TO_PX = 96 / 25.4;

export type HeadlessEditableDocxResult = { bytes: Uint8Array; pageCount: number; warnings: string[] };

export function buildHeadlessEditableDocx(template: TemplateDefinition, model: RenderModel): HeadlessEditableDocxResult {
  const dimensions = getPageDimensions(template.page);
  const widthPx = dimensions.widthMm * MM_TO_PX;
  const heightPx = dimensions.heightMm * MM_TO_PX;
  const margins = template.page.margins;
  const contentWidthPx = Math.max(1, widthPx - (margins.left + margins.right) * MM_TO_PX);
  const rows: EditableDocxLayoutRow[] = [];
  const warnings: string[] = [];
  let topPx = Math.max(0, margins.top * MM_TO_PX);

  const appendRegion = (blocks: readonly RenderBlock[] | undefined) => {
    for (const block of blocks ?? []) {
      const converted = blockToRows(block, contentWidthPx, warnings);
      for (const row of converted) {
        rows.push({ ...row, topPx });
        topPx += Math.max(1, row.heightPx);
      }
    }
  };

  appendRegion(model.header);
  appendRegion(model.body);
  appendRegion(model.footer);

  const page: EditableDocxPage = {
    widthMm: dimensions.widthMm,
    heightMm: dimensions.heightMm,
    widthPx,
    heightPx,
    rows,
    name: template.name,
  };

  return {
    bytes: buildEditableDocx([page], { title: template.name, creator: 'Document Builder API' }),
    pageCount: 1,
    warnings,
  };
}

function blockToRows(block: RenderBlock | RenderBoxChildBlock | RenderRowChildBlock, widthPx: number, warnings: string[]): EditableDocxLayoutRow[] {
  if (block.type === 'ROW') {
    const children = block.columns.length
      ? block.columns.flatMap((column) => column.children)
      : block.children;
    const widths = block.columns.length
      ? block.columns.map((column) => Math.max(1, widthPx * column.widthPercent / 100))
      : distributeChildWidths(children, widthPx);
    const cells: EditableDocxLayoutCell[] = [];
    children.forEach((child, index) => {
      const childWidth = widths[Math.min(index, widths.length - 1)] ?? widthPx / Math.max(1, children.length);
      const childBlock = blockToEditableBlock(child, warnings);
      cells.push({ widthPx: childWidth, ...(childBlock ? { block: childBlock } : {}) });
    });
    return [{ topPx: 0, heightPx: estimateRowHeight(cells), cells }];
  }

  if (block.type === 'BOX') {
    const rows: EditableDocxLayoutRow[] = [];
    for (const child of block.children) rows.push(...blockToRows(child, widthPx, warnings));
    return rows.length ? rows : [{ topPx: 0, heightPx: 8, cells: [{ widthPx }] }];
  }

  const editable = blockToEditableBlock(block, warnings);
  return [{ topPx: 0, heightPx: estimateBlockHeight(block), cells: [{ widthPx, ...(editable ? { block: editable } : {}) }] }];
}

function blockToEditableBlock(block: RenderBlock | RenderBoxChildBlock | RenderRowChildBlock, warnings: string[]): EditableDocxBlock | undefined {
  switch (block.type) {
    case 'TEXT':
      return { kind: 'text', text: block.text, style: textStyle(block.style) };
    case 'FIELD': {
      const text = block.label ? `${block.label}${block.layoutMode === 'STACKED' ? '\n' : ' '}${block.value}` : block.value;
      return { kind: 'text', text, style: textStyle(block.valueStyle) };
    }
    case 'DIVIDER':
      return { kind: 'divider', color: block.color, widthPx: Math.max(1, block.thickness) };
    case 'SPACER':
      return undefined;
    case 'IMAGE': {
      const image = dataUrlImage(block.source, block.width * MM_TO_PX, (block.height ?? block.width) * MM_TO_PX);
      if (!image) warnings.push(`Image block ${block.id} could not be embedded headlessly; only PNG/JPEG data URLs are supported.`);
      return image ?? { kind: 'text', text: block.altText || '[Image]', style: { align: alignment(block.alignment) } };
    }
    case 'TABLE':
      return tableBlock(block.columns.map((column) => column.label), block.rows, block.columns.map((column) => column.widthPercent), block.showHeader, block.showBorder, block.headerStyle, block.cellStyle);
    case 'SUMMARY_TABLE': {
      const rows = block.rows.map((row) => block.columns.map((column) => row.cells.find((cell) => cell.columnId === column.id)?.value ?? ''));
      if (block.totalRow) rows.push(block.columns.map((column) => block.totalRow!.cells.find((cell) => cell.columnId === column.id)?.value ?? ''));
      return tableBlock(block.columns.map((column) => column.label), rows, block.columns.map((column) => column.widthPercent), block.showHeader, block.showBorder, block.headerStyle, block.cellStyle);
    }
    case 'CUSTOM_TABLE': {
      const rows: Array<Array<string | number | boolean | null>> = Array.from({ length: block.rowCount }, () => Array.from({ length: block.columnCount }, () => ''));
      for (const cell of block.cells) {
        const value = cell.content.value ?? cell.content.source ?? '';
        rows[cell.row]![cell.column] = value == null ? '' : typeof value === 'boolean' ? value : String(value);
      }
      return tableBlock([], rows, undefined, false, block.showBorder, undefined, undefined);
    }
    case 'BOX': {
      const text = flattenText(block.children);
      return { kind: 'text', text, style: { background: block.style.backgroundColor, borderColor: block.style.border.color, borderWidthPx: block.style.border.width, borderStyle: borderStyle(block.style.border.style) } };
    }
    case 'ROW': {
      warnings.push(`Nested row block ${block.id} was flattened for editable DOCX.`);
      const children = block.columns.length ? block.columns.flatMap((column) => column.children) : block.children;
      return { kind: 'text', text: flattenText(children), style: { align: 'left' } };
    }
  }
}

function tableBlock(
  headers: string[],
  rows: Array<Array<string | number | boolean | null>>,
  widths: Array<number | undefined> | undefined,
  showHeader: boolean,
  showBorder: boolean,
  headerStyle?: RequiredTextStyle,
  cellStyle?: RequiredTextStyle,
): EditableDocxTableBlock {
  const columns = Math.max(1, headers.length, ...rows.map((row) => row.length));
  const editableRows = [] as EditableDocxTableBlock['rows'];
  if (showHeader && headers.length) editableRows.push({ cells: headers.map((value, index) => cell(String(value), index, textStyle(headerStyle))) });
  for (const row of rows) editableRows.push({ cells: Array.from({ length: columns }, (_, index) => cell(valueString(row[index]), index, textStyle(cellStyle))) });
  const normalizedWidths = normalizeWidths(widths, columns);
  return {
    kind: 'table',
    columns,
    columnWidthsPct: normalizedWidths,
    rows: editableRows.length ? editableRows : [{ cells: [cell('', 0, textStyle(cellStyle))] }],
    borderStyle: showBorder ? 'solid' : 'none',
    borderColor: '#CBD5E1',
    borderWidthPx: showBorder ? 1 : 0,
  };
}

function cell(text: string, startColumn: number, style?: EditableTextStyle): EditableDocxTableCell {
  return { text, startColumn, colSpan: 1, rowSpan: 1, ...(style ? { style } : {}) };
}

function valueString(value: string | number | boolean | null | undefined): string { return value == null ? '' : String(value); }

function textStyle(style?: RequiredTextStyle): EditableTextStyle | undefined {
  if (!style) return undefined;
  return {
    fontSizePx: Math.max(1, style.fontSize * 96 / 72),
    fontFamily: style.fontFamily,
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
    color: style.textColor,
    align: alignment(style.alignment),
    background: style.backgroundColor,
  };
}

function alignment(value: 'LEFT' | 'CENTER' | 'RIGHT'): EditableTextStyle['align'] {
  return value === 'CENTER' ? 'center' : value === 'RIGHT' ? 'right' : 'left';
}

function borderStyle(value: string): EditableTextStyle['borderStyle'] {
  return value === 'DASHED' ? 'dashed' : value === 'DOTTED' ? 'dotted' : value === 'DOUBLE' ? 'double' : value === 'NONE' ? 'none' : 'solid';
}

function dataUrlImage(source: string, widthPx: number, heightPx: number): EditableDocxImageBlock | undefined {
  const match = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(source.trim());
  if (!match) return undefined;
  return { kind: 'image', bytes: decodeBase64(match[2]!), mimeType: match[1]!.toLowerCase() as 'image/png' | 'image/jpeg', widthPx: Math.max(1, widthPx), heightPx: Math.max(1, heightPx) };
}

function distributeChildWidths(children: readonly RenderRowChildBlock[], widthPx: number): number[] {
  const explicit = children.reduce((sum, child) => sum + Math.max(0, child.layout.widthPercent), 0);
  if (explicit <= 0) return children.map(() => widthPx / Math.max(1, children.length));
  return children.map((child) => widthPx * Math.max(0, child.layout.widthPercent) / explicit);
}

function normalizeWidths(widths: Array<number | undefined> | undefined, count: number): number[] {
  const values = Array.from({ length: count }, (_, index) => Math.max(0, widths?.[index] ?? 0));
  const explicit = values.reduce((sum, value) => sum + value, 0);
  if (explicit <= 0) return Array.from({ length: count }, () => 100 / count);
  return values.map((value) => value > 0 ? value * 100 / explicit : 0);
}

function estimateBlockHeight(block: RenderBlock | RenderBoxChildBlock | RenderRowChildBlock): number {
  if (block.type === 'SPACER') return Math.max(1, block.height * MM_TO_PX);
  if (block.type === 'DIVIDER') return Math.max(8, block.thickness + 6);
  if (block.type === 'IMAGE') return Math.max(24, (block.height ?? block.width) * MM_TO_PX);
  if (block.type === 'TABLE') return Math.max(28, (block.rows.length + (block.showHeader ? 1 : 0)) * 26);
  if (block.type === 'SUMMARY_TABLE') return Math.max(28, (block.rows.length + (block.showHeader ? 1 : 0) + (block.totalRow ? 1 : 0)) * 26);
  if (block.type === 'CUSTOM_TABLE') return Math.max(28, block.rowCount * 26);
  return 28;
}

function estimateRowHeight(cells: readonly EditableDocxLayoutCell[]): number {
  return Math.max(28, ...cells.map((item) => item.block?.kind === 'image' ? item.block.heightPx : item.block?.kind === 'table' ? item.block.rows.length * 26 : 28));
}

function flattenText(children: readonly RenderBoxChildBlock[] | readonly RenderRowChildBlock[]): string {
  return children.map((child) => {
    if (child.type === 'TEXT') return child.text;
    if (child.type === 'FIELD') return child.label ? `${child.label} ${child.value}` : child.value;
    if (child.type === 'IMAGE') return child.altText || '[Image]';
    if (child.type === 'BOX') return flattenText(child.children);
    return '';
  }).filter(Boolean).join('\n');
}


function decodeBase64(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = value.replace(/\s+/g, '').replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}
