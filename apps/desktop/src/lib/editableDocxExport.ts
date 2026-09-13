import html2canvas from 'html2canvas';
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
import type { MaterializedRenderDocument, MaterializedRenderPage } from './materializedRenderModel.ts';

export type EditableDocxExportProgress = { current: number; total: number; page: MaterializedRenderPage };
export type EditableDocxExportOptions = { onProgress?: (progress: EditableDocxExportProgress) => void };

/**
 * DB-4.5C v2 native editable DOCX export.
 *
 * The existing DOCX Exact path is intentionally untouched. This mode reads the
 * already-materialized physical Preview pages and converts visible top-level
 * document blocks into native Word text/tables. Bitmap media remains bitmap.
 * Word may reflow native content slightly, but users can edit the resulting text
 * and table cells. Page order/document context are shared with Preview/PDF.
 */
export async function buildEditablePreviewDocx(
  model: MaterializedRenderDocument,
  resolvePageNode: (page: MaterializedRenderPage) => Promise<HTMLElement>,
  options: EditableDocxExportOptions = {},
): Promise<Uint8Array> {
  const pages: EditableDocxPage[] = [];
  for (let index = 0; index < model.pages.length; index += 1) {
    const page = model.pages[index]!;
    const node = await resolvePageNode(page);
    await decodeImages(node);
    pages.push(await extractEditablePage(node, page));
    options.onProgress?.({ current: index + 1, total: model.pages.length, page });
  }
  return buildEditableDocx(pages, { title: model.name, creator: 'Document Builder' });
}

async function extractEditablePage(node: HTMLElement, page: MaterializedRenderPage): Promise<EditableDocxPage> {
  const elements = Array.from(node.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains('canvas-element'));
  const items: ExtractedItem[] = [];
  for (const element of elements) {
    const left = numericStyle(element.style.left, element.offsetLeft);
    const top = numericStyle(element.style.top, element.offsetTop);
    const width = Math.max(1, numericStyle(element.style.width, element.offsetWidth));
    const height = Math.max(1, Math.max(numericStyle(element.style.height, element.offsetHeight), element.scrollHeight || 0));
    const block = await extractBlock(element, width, height);
    if (!block) continue;
    items.push({ left, top, width, height, block });
  }
  const groups = groupRows(items);
  const rows: EditableDocxLayoutRow[] = groups.map((group) => makeLayoutRow(group, page.widthPx));
  return { widthMm: page.widthMm, heightMm: page.heightMm, widthPx: page.widthPx, heightPx: page.heightPx, rows, name: `${page.builderPageName} ${page.continuationIndex + 1}` };
}

type ExtractedItem = { left: number; top: number; width: number; height: number; block: EditableDocxBlock };

function groupRows(items: ExtractedItem[]): ExtractedItem[][] {
  const sorted = [...items].sort((a, b) => a.top - b.top || a.left - b.left);
  const groups: ExtractedItem[][] = [];
  const tolerance = 5;
  for (const item of sorted) {
    const existing = groups.find((group) => Math.abs(group[0]!.top - item.top) <= tolerance);
    if (existing) existing.push(item);
    else groups.push([item]);
  }
  groups.forEach((group) => group.sort((a, b) => a.left - b.left));
  groups.sort((a, b) => a[0]!.top - b[0]!.top);
  return groups;
}

function makeLayoutRow(group: ExtractedItem[], pageWidth: number): EditableDocxLayoutRow {
  const cells: EditableDocxLayoutCell[] = [];
  let cursor = 0;
  for (const item of group) {
    const left = Math.max(0, Math.min(pageWidth, item.left));
    if (left > cursor + 0.5) cells.push({ widthPx: left - cursor });
    const width = Math.max(1, Math.min(pageWidth - left, item.width));
    cells.push({ widthPx: width, block: item.block });
    cursor = Math.max(cursor, left + width);
  }
  if (cursor < pageWidth - 0.5) cells.push({ widthPx: pageWidth - cursor });
  return {
    topPx: Math.max(0, Math.min(...group.map((item) => item.top))),
    heightPx: Math.max(...group.map((item) => item.height)),
    cells,
  };
}

async function extractBlock(element: HTMLElement, width: number, height: number): Promise<EditableDocxBlock | null> {
  if (element.classList.contains('element-table')) return extractTableBlock(element);
  if (element.classList.contains('element-divider')) {
    const line = element.querySelector<HTMLElement>('.divider-line');
    const style = getComputedStyle(line ?? element);
    return { kind: 'divider', color: cssColorToHex(style.borderBottomColor || style.backgroundColor) ?? '#64748b', widthPx: parseFloat(style.borderBottomWidth) || 1 };
  }
  if (element.classList.contains('element-image') || element.classList.contains('element-signature')) {
    const image = element.querySelector<HTMLImageElement>('img');
    if (image?.src) {
      const direct = await imageBlockFromSource(image.src, width, height);
      if (direct) return direct;
    }
    return rasterBlock(element, width, height);
  }
  if (element.classList.contains('element-qr') || element.classList.contains('element-barcode')) return rasterBlock(element, width, height);

  const textHost = element.querySelector<HTMLElement>('.text-content,.formula-field-result,.shape-text-content');
  const text = textHost?.innerText ?? '';
  const style = styleFromElement(element);
  if (element.classList.contains('element-shape')) {
    const computed = getComputedStyle(element);
    style.background = cssColorToHex(computed.backgroundColor) ?? style.background;
    style.borderColor = cssColorToHex(computed.borderColor) ?? '#B7C4D8';
    style.borderWidthPx = parseFloat(computed.borderWidth) || 1;
    style.borderStyle = cssBorderStyle(computed.borderStyle);
  }
  return { kind: 'text', text, style };
}

function extractTableBlock(element: HTMLElement): EditableDocxTableBlock {
  const table = element.querySelector<HTMLTableElement>('table.db-table');
  if (!table) return { kind: 'table', columns: 1, rows: [{ cells: [{ text: 'Table', startColumn: 0, colSpan: 1, rowSpan: 1 }] }] };
  const colNodes = Array.from(table.querySelectorAll<HTMLTableColElement>('colgroup col'));
  let columns = colNodes.length;
  const rows = Array.from(table.rows);
  if (!columns) columns = rows.reduce((max, row) => Math.max(max, Array.from(row.cells).reduce((sum, cell) => sum + Math.max(1, cell.colSpan || 1), 0)), 1);
  const columnWidthsPct = colNodes.length ? colNodes.map((col) => parseCssPercent(col.style.width) ?? (100 / columns)) : Array.from({ length: columns }, () => 100 / columns);
  const activeSpans = Array.from({ length: columns }, () => 0);
  const editableRows = rows.map((row) => {
    const occupied = activeSpans.map((value) => value > 0);
    let cursor = 0;
    const cells: EditableDocxTableCell[] = [];
    for (const cell of Array.from(row.cells)) {
      while (cursor < columns && occupied[cursor]) cursor += 1;
      const colSpan = Math.max(1, cell.colSpan || 1);
      const rowSpan = Math.max(1, cell.rowSpan || 1);
      const computed = getComputedStyle(cell);
      cells.push({
        text: cleanCellText(cell),
        startColumn: Math.min(columns - 1, cursor),
        colSpan,
        rowSpan,
        style: {
          ...styleFromComputed(computed),
          background: cssColorToHex(computed.backgroundColor),
          verticalAlign: computed.verticalAlign === 'middle' ? 'center' : computed.verticalAlign === 'bottom' ? 'bottom' : 'top',
          paddingPx: parseFloat(computed.paddingLeft) || 4,
        },
      });
      if (rowSpan > 1) for (let c = cursor; c < Math.min(columns, cursor + colSpan); c += 1) activeSpans[c] = Math.max(activeSpans[c]!, rowSpan);
      cursor += colSpan;
    }
    for (let c = 0; c < activeSpans.length; c += 1) if (activeSpans[c]! > 0) activeSpans[c]!--;
    return { heightPx: Math.max(1, row.offsetHeight || parseFloat(getComputedStyle(row).height) || 24), cells };
  });
  const firstCell = table.querySelector<HTMLTableCellElement>('td,th');
  const tableStyle = firstCell ? getComputedStyle(firstCell) : getComputedStyle(table);
  return {
    kind: 'table', columns, columnWidthsPct, rows: editableRows,
    borderStyle: cssBorderStyle(tableStyle.borderTopStyle),
    borderColor: cssColorToHex(tableStyle.borderTopColor) ?? '#CBD5E1',
    borderWidthPx: parseFloat(tableStyle.borderTopWidth) || 1,
  };
}

function cleanCellText(cell: HTMLTableCellElement): string {
  const clone = cell.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.db-column-resize-handle,.db-table-media-placeholder svg,.db-table-cell-image-spacer').forEach((node) => node.remove());
  return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
}

function styleFromElement(element: HTMLElement): EditableTextStyle { return styleFromComputed(getComputedStyle(element)); }
function styleFromComputed(style: CSSStyleDeclaration): EditableTextStyle {
  return {
    fontSizePx: parseFloat(style.fontSize) || 14,
    fontFamily: style.fontFamily?.split(',')[0]?.replace(/["']/g, '').trim() || 'Arial',
    bold: Number(style.fontWeight) >= 600 || /bold/i.test(style.fontWeight),
    italic: style.fontStyle === 'italic',
    underline: style.textDecorationLine.includes('underline'),
    color: cssColorToHex(style.color) ?? '#111827',
    align: style.textAlign === 'center' ? 'center' : style.textAlign === 'right' ? 'right' : 'left',
  };
}

function cssBorderStyle(value: string): EditableTextStyle['borderStyle'] {
  return value === 'dashed' ? 'dashed' : value === 'dotted' ? 'dotted' : value === 'double' ? 'double' : value === 'none' || value === 'hidden' ? 'none' : 'solid';
}

function cssColorToHex(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  const hex = v.match(/^#([0-9a-f]{6})$/i); if (hex) return `#${hex[1]}`;
  const rgb = v.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)$/i);
  if (!rgb) return undefined;
  if (rgb[4] !== undefined && Number(rgb[4]) === 0) return undefined;
  return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

function numericStyle(value: string, fallback: number): number { const parsed = parseFloat(value); return Number.isFinite(parsed) ? parsed : fallback; }
function parseCssPercent(value: string): number | undefined { const match = String(value || '').match(/([\d.]+)%/); return match ? Number(match[1]) : undefined; }

async function imageBlockFromSource(src: string, width: number, height: number): Promise<EditableDocxImageBlock | null> {
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    if (blob.type !== 'image/png' && blob.type !== 'image/jpeg') return null;
    return { kind: 'image', bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type as 'image/png' | 'image/jpeg', widthPx: width, heightPx: height };
  } catch { return null; }
}

async function rasterBlock(element: HTMLElement, width: number, height: number): Promise<EditableDocxImageBlock> {
  const hadClass = element.classList.contains('repeated-region-projection');
  const oldData = element.getAttribute('data-repeated-projection');
  element.classList.remove('repeated-region-projection');
  element.setAttribute('data-repeated-projection', 'false');
  try {
    const canvas = await html2canvas(element, { backgroundColor: null, scale: 2, useCORS: true, logging: false, removeContainer: true });
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Unable to encode editable DOCX media.')), 'image/png'));
    return { kind: 'image', bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: 'image/png', widthPx: width, heightPx: height };
  } finally {
    if (hadClass) element.classList.add('repeated-region-projection');
    if (oldData === null) element.removeAttribute('data-repeated-projection'); else element.setAttribute('data-repeated-projection', oldData);
  }
}

async function decodeImages(root: HTMLElement) {
  await Promise.all(Array.from(root.querySelectorAll('img')).map(async (image) => {
    try { if (typeof image.decode === 'function') await image.decode(); } catch { /* best effort */ }
  }));
}
