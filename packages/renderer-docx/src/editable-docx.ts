export type EditableTextStyle = {
  fontSizePx?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  align?: 'left' | 'center' | 'right';
  background?: string;
  borderColor?: string;
  borderWidthPx?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
};

export type EditableDocxTextBlock = {
  kind: 'text';
  text: string;
  style?: EditableTextStyle;
};

export type EditableDocxImageBlock = {
  kind: 'image';
  bytes: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg';
  widthPx: number;
  heightPx: number;
};

export type EditableDocxDividerBlock = {
  kind: 'divider';
  color?: string;
  widthPx?: number;
};

export type EditableDocxTableCell = {
  text: string;
  startColumn: number;
  colSpan: number;
  rowSpan: number;
  style?: EditableTextStyle & {
    verticalAlign?: 'top' | 'center' | 'bottom';
    paddingPx?: number;
  };
};

export type EditableDocxTableRow = {
  heightPx?: number;
  cells: EditableDocxTableCell[];
};

export type EditableDocxTableBlock = {
  kind: 'table';
  columns: number;
  columnWidthsPct?: number[];
  rows: EditableDocxTableRow[];
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
  borderColor?: string;
  borderWidthPx?: number;
};

export type EditableDocxBlock = EditableDocxTextBlock | EditableDocxImageBlock | EditableDocxDividerBlock | EditableDocxTableBlock;

export type EditableDocxLayoutCell = {
  widthPx: number;
  block?: EditableDocxBlock;
};

export type EditableDocxLayoutRow = {
  topPx: number;
  heightPx: number;
  cells: EditableDocxLayoutCell[];
};

export type EditableDocxPage = {
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  rows: EditableDocxLayoutRow[];
  name?: string;
};

export type EditableDocxOptions = {
  title?: string;
  creator?: string;
};

const XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
const MM_TO_TWIP = 1440 / 25.4;
const PX_TO_PT = 72 / 96;
const PX_TO_EMU = 914400 / 96;

/**
 * DB-4.5C v2 native editable DOCX builder.
 *
 * It intentionally lives beside the v1 raster renderer instead of replacing it.
 * Text and table content are emitted as native WordprocessingML so users can
 * edit them in Word. Raster/media blocks stay as images. The caller supplies a
 * materialized physical-page layout extracted from the already-tested Preview,
 * so page order and document context are shared with PDF/DOCX Exact.
 */
export function buildEditableDocx(pages: readonly EditableDocxPage[], options: EditableDocxOptions = {}): Uint8Array {
  if (!pages.length) throw new Error('Cannot build an editable DOCX without pages.');
  const ctx: BuildContext = { media: [], nextImageId: 1 };
  const body: string[] = [];

  pages.forEach((page, pageIndex) => {
    body.push(renderPageContent(page, ctx));
    if (pageIndex < pages.length - 1) {
      body.push(`<w:p><w:pPr>${sectionProperties(page, true)}</w:pPr></w:p>`);
    }
  });
  body.push(sectionProperties(pages[pages.length - 1]!, false));

  const files: ZipEntry[] = [];
  for (const media of ctx.media) files.push({ name: `word/media/${media.name}`, bytes: media.bytes });
  files.push({ name: '[Content_Types].xml', text: contentTypesXml(ctx.media) });
  files.push({ name: '_rels/.rels', text: rootRelsXml() });
  files.push({ name: 'docProps/core.xml', text: coreXml(options) });
  files.push({ name: 'docProps/app.xml', text: appXml(pages.length) });
  files.push({ name: 'word/document.xml', text: documentXml(body.join('')) });
  files.push({ name: 'word/_rels/document.xml.rels', text: documentRelsXml(ctx.media) });
  files.push({ name: 'word/styles.xml', text: stylesXml() });
  files.push({ name: 'word/settings.xml', text: settingsXml() });
  return buildStoreZip(files);
}

type MediaEntry = { id: number; relId: string; name: string; bytes: Uint8Array; mimeType: 'image/png' | 'image/jpeg' };
type BuildContext = { media: MediaEntry[]; nextImageId: number };

function renderPageContent(page: EditableDocxPage, ctx: BuildContext): string {
  const twipsPerPx = Math.max(0.1, (page.widthMm * MM_TO_TWIP) / Math.max(1, page.widthPx));
  const ordered = [...page.rows].sort((a, b) => a.topPx - b.topPx);
  const xml: string[] = [];
  let cursorBottom = 0;
  for (const row of ordered) {
    const gapPx = Math.max(0, row.topPx - cursorBottom);
    if (gapPx > 1) xml.push(spacerParagraph(Math.round(gapPx * twipsPerPx)));
    xml.push(renderLayoutRow(row, page.widthPx, twipsPerPx, ctx));
    cursorBottom = Math.max(cursorBottom, row.topPx + row.heightPx);
  }
  return xml.join('');
}

function renderLayoutRow(row: EditableDocxLayoutRow, pageWidthPx: number, twipsPerPx: number, ctx: BuildContext): string {
  const totalTwips = Math.max(1, Math.round(pageWidthPx * twipsPerPx));
  const cells = row.cells.filter((cell) => cell.widthPx > 0.25);
  const widths = cells.map((cell) => Math.max(1, Math.round(cell.widthPx * twipsPerPx)));
  const used = widths.reduce((a, b) => a + b, 0);
  if (used !== totalTwips && widths.length) widths[widths.length - 1] = Math.max(1, widths[widths.length - 1]! + (totalTwips - used));
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('');
  const tc = cells.map((cell, index) => {
    const width = widths[index]!;
    const content = cell.block ? renderBlock(cell.block, width, ctx) : emptyParagraph();
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar><w:tcBorders>${nilBorders()}</w:tcBorders></w:tcPr>${content}</w:tc>`;
  }).join('');
  const h = Math.max(1, Math.round(row.heightPx * twipsPerPx));
  return `<w:tbl><w:tblPr><w:tblW w:w="${totalTwips}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${nilBorders()}</w:tblBorders><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid><w:tr><w:trPr><w:trHeight w:val="${h}" w:hRule="atLeast"/></w:trPr>${tc}</w:tr></w:tbl>`;
}

function renderBlock(block: EditableDocxBlock, availableTwips: number, ctx: BuildContext): string {
  if (block.kind === 'text') return textParagraph(block.text, block.style);
  if (block.kind === 'divider') return dividerParagraph(block.color, block.widthPx);
  if (block.kind === 'table') return renderNativeTable(block, availableTwips);
  return imageParagraph(block, availableTwips, ctx);
}

function textParagraph(text: string, style: EditableTextStyle = {}): string {
  const align = style.align === 'center' ? 'center' : style.align === 'right' ? 'right' : 'left';
  const beforeAfter = `<w:spacing w:before="0" w:after="0"/>`;
  const pShd = validHex(style.background) ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(style.background)}"/>` : '';
  const border = paragraphBorder(style);
  const lines = String(text ?? '').split(/\r?\n/);
  const runs = lines.map((line, index) => `${index ? '<w:r><w:br/></w:r>' : ''}${textRun(line, style)}`).join('');
  return `<w:p><w:pPr>${beforeAfter}<w:jc w:val="${align}"/>${pShd}${border}</w:pPr>${runs || textRun('', style)}</w:p>`;
}

function textRun(text: string, style: EditableTextStyle): string {
  const sizePt = Math.max(1, (style.fontSizePx ?? 14) * PX_TO_PT);
  const halfPoints = Math.max(2, Math.round(sizePt * 2));
  const font = xmlEscape(style.fontFamily || 'Arial');
  const color = validHex(style.color) ? `<w:color w:val="${hex(style.color)}"/>` : '';
  return `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>${style.bold ? '<w:b/>' : ''}${style.italic ? '<w:i/>' : ''}${style.underline ? '<w:u w:val="single"/>' : ''}${color}<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function paragraphBorder(style: EditableTextStyle): string {
  if (!style.borderWidthPx || style.borderStyle === 'none') return '';
  const val = borderVal(style.borderStyle);
  const sz = Math.max(2, Math.min(96, Math.round(style.borderWidthPx * 6)));
  const color = validHex(style.borderColor) ? hex(style.borderColor) : 'B7C4D8';
  const edge = `<w:top w:val="${val}" w:sz="${sz}" w:space="0" w:color="${color}"/><w:left w:val="${val}" w:sz="${sz}" w:space="0" w:color="${color}"/><w:bottom w:val="${val}" w:sz="${sz}" w:space="0" w:color="${color}"/><w:right w:val="${val}" w:sz="${sz}" w:space="0" w:color="${color}"/>`;
  return `<w:pBdr>${edge}</w:pBdr>`;
}

function dividerParagraph(color = '#64748b', widthPx = 1): string {
  const sz = Math.max(2, Math.min(96, Math.round(widthPx * 6)));
  const c = validHex(color) ? hex(color) : '64748B';
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:pBdr><w:bottom w:val="single" w:sz="${sz}" w:space="0" w:color="${c}"/></w:pBdr></w:pPr><w:r><w:t></w:t></w:r></w:p>`;
}

function renderNativeTable(table: EditableDocxTableBlock, availableTwips: number): string {
  const colCount = Math.max(1, table.columns);
  const pcts = normalizePcts(table.columnWidthsPct, colCount);
  const widths = pcts.map((pct) => Math.max(1, Math.round(availableTwips * pct / 100)));
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('');
  const matrix = buildTableMatrix(table.rows, colCount);
  const rows = matrix.map((row, rowIndex) => {
    const sourceRow = table.rows[rowIndex];
    const tcs: string[] = [];
    let column = 0;
    while (column < colCount) {
      const slot = row[column];
      if (!slot) {
        tcs.push(tableCellXml('', widths[column]!, {}, 1, undefined));
        column += 1;
        continue;
      }
      if (slot.kind === 'continuation') {
        const span = slot.colSpan;
        const width = widths.slice(column, column + span).reduce((sum, value) => sum + value, 0);
        tcs.push(tableCellXml('', width, slot.style, span, 'continue'));
        column += span;
        continue;
      }
      const cell = slot.cell;
      const span = Math.max(1, cell.colSpan);
      const width = widths.slice(column, column + span).reduce((sum, value) => sum + value, 0);
      tcs.push(tableCellXml(cell.text, width, cell.style ?? {}, span, cell.rowSpan > 1 ? 'restart' : undefined));
      column += span;
    }
    const rowHeight = sourceRow?.heightPx ? `<w:trHeight w:val="${Math.max(1, Math.round(sourceRow.heightPx * 15))}" w:hRule="atLeast"/>` : '';
    return `<w:tr><w:trPr>${rowHeight}</w:trPr>${tcs.join('')}</w:tr>`;
  }).join('');
  const borders = wordBorders(table.borderStyle ?? 'solid', table.borderColor ?? '#CBD5E1', table.borderWidthPx ?? 1);
  return `<w:tbl><w:tblPr><w:tblW w:w="${availableTwips}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>${emptyParagraph()}`;
}

type MatrixSlot = { kind: 'origin'; cell: EditableDocxTableCell } | { kind: 'continuation'; colSpan: number; style?: EditableDocxTableCell['style'] } | null;
function buildTableMatrix(rows: readonly EditableDocxTableRow[], columns: number): MatrixSlot[][] {
  const matrix: MatrixSlot[][] = rows.map(() => Array.from({ length: columns }, () => null));
  rows.forEach((row, rowIndex) => {
    for (const cell of row.cells) {
      const start = Math.max(0, Math.min(columns - 1, cell.startColumn));
      matrix[rowIndex]![start] = { kind: 'origin', cell };
      const colSpan = Math.max(1, Math.min(columns - start, cell.colSpan));
      const rowSpan = Math.max(1, cell.rowSpan);
      for (let r = rowIndex + 1; r < Math.min(rows.length, rowIndex + rowSpan); r += 1) {
        matrix[r]![start] = { kind: 'continuation', colSpan, style: cell.style };
      }
      for (let c = start + 1; c < start + colSpan; c += 1) matrix[rowIndex]![c] = null;
    }
  });
  return matrix;
}

function tableCellXml(text: string, width: number, style: EditableDocxTableCell['style'] = {}, colSpan = 1, vMerge?: 'restart' | 'continue'): string {
  const background = validHex(style.background) ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(style.background)}"/>` : '';
  const valign = style.verticalAlign ? `<w:vAlign w:val="${style.verticalAlign === 'center' ? 'center' : style.verticalAlign}"/>` : '';
  const padding = Math.max(0, Math.round((style.paddingPx ?? 4) * 15));
  const margin = `<w:tcMar><w:top w:w="${padding}" w:type="dxa"/><w:left w:w="${padding}" w:type="dxa"/><w:bottom w:w="${padding}" w:type="dxa"/><w:right w:w="${padding}" w:type="dxa"/></w:tcMar>`;
  const merge = vMerge ? `<w:vMerge${vMerge === 'restart' ? ' w:val="restart"' : ''}/>` : '';
  const gridSpan = colSpan > 1 ? `<w:gridSpan w:val="${colSpan}"/>` : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${gridSpan}${merge}${background}${valign}${margin}</w:tcPr>${textParagraph(text, style)}</w:tc>`;
}

function imageParagraph(block: EditableDocxImageBlock, availableTwips: number, ctx: BuildContext): string {
  const id = ctx.nextImageId++;
  const ext = block.mimeType === 'image/png' ? 'png' : 'jpg';
  const relId = `rIdEditableImage${id}`;
  const name = `editable-${id}.${ext}`;
  ctx.media.push({ id, relId, name, bytes: block.bytes, mimeType: block.mimeType });
  const maxWidthPx = availableTwips / 15;
  const scale = Math.min(1, maxWidthPx / Math.max(1, block.widthPx));
  const widthPx = Math.max(1, block.widthPx * scale);
  const heightPx = Math.max(1, block.heightPx * scale);
  const cx = Math.round(widthPx * PX_TO_EMU);
  const cy = Math.round(heightPx * PX_TO_EMU);
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Editable media ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${xmlEscape(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function spacerParagraph(heightTwips: number): string {
  const h = Math.max(1, heightTwips);
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${h}" w:lineRule="exact"/></w:pPr><w:r><w:t></w:t></w:r></w:p>`;
}
function emptyParagraph(): string { return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`; }

function sectionProperties(page: EditableDocxPage, nextPage: boolean): string {
  const w = Math.max(1, Math.round(page.widthMm * MM_TO_TWIP));
  const h = Math.max(1, Math.round(page.heightMm * MM_TO_TWIP));
  const orient = w > h ? ' w:orient="landscape"' : '';
  return `<w:sectPr>${nextPage ? '<w:type w:val="nextPage"/>' : ''}<w:pgSz w:w="${w}" w:h="${h}"${orient}/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/><w:cols w:space="0"/><w:docGrid w:linePitch="360"/></w:sectPr>`;
}

function normalizePcts(input: number[] | undefined, columns: number): number[] {
  if (!input?.length) return Array.from({ length: columns }, () => 100 / columns);
  const values = Array.from({ length: columns }, (_, index) => Math.max(0.01, input[index] ?? 0.01));
  const sum = values.reduce((a, b) => a + b, 0);
  return values.map((value) => value * 100 / sum);
}
function borderVal(style: EditableTextStyle['borderStyle']): string { return style === 'dashed' ? 'dashed' : style === 'dotted' ? 'dotted' : style === 'double' ? 'double' : style === 'none' ? 'nil' : 'single'; }
function wordBorders(style: EditableTextStyle['borderStyle'], color: string, widthPx: number): string {
  const val = borderVal(style);
  const sz = Math.max(2, Math.min(96, Math.round(widthPx * 6)));
  const c = validHex(color) ? hex(color) : 'CBD5E1';
  const edge = (name: string) => `<w:${name} w:val="${val}" w:sz="${sz}" w:space="0" w:color="${c}"/>`;
  return edge('top') + edge('left') + edge('bottom') + edge('right') + edge('insideH') + edge('insideV');
}
function nilBorders(): string { return `<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>`; }
function validHex(value?: string): boolean { return Boolean(value && /^#?[0-9a-f]{6}$/i.test(value.trim())); }
function hex(value?: string): string { return (value || '').trim().replace(/^#/, '').toUpperCase(); }
function xmlEscape(value: string): string { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }

function documentXml(body: string): string {
  return `${XML}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}</w:body></w:document>`;
}
function contentTypesXml(media: readonly MediaEntry[]): string {
  const hasPng = media.some((item) => item.mimeType === 'image/png');
  const hasJpeg = media.some((item) => item.mimeType === 'image/jpeg');
  return `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${hasPng ? '<Default Extension="png" ContentType="image/png"/>' : ''}${hasJpeg ? '<Default Extension="jpg" ContentType="image/jpeg"/>' : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}
function rootRelsXml(): string { return `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`; }
function documentRelsXml(media: readonly MediaEntry[]): string { return `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${media.map((item) => `<Relationship Id="${item.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${item.name}"/>`).join('')}</Relationships>`; }
function stylesXml(): string { return `${XML}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style></w:styles>`; }
function settingsXml(): string { return `${XML}<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:doNotTrackMoves/><w:doNotTrackFormatting/></w:settings>`; }
function coreXml(options: EditableDocxOptions): string { const title = xmlEscape(options.title || 'Document'); const creator = xmlEscape(options.creator || 'Document Builder'); const now = new Date().toISOString(); return `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${title}</dc:title><dc:creator>${creator}</dc:creator><cp:lastModifiedBy>${creator}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`; }
function appXml(pageCount: number): string { return `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Document Builder</Application><Pages>${pageCount}</Pages><Company></Company><AppVersion>1.0</AppVersion></Properties>`; }

type ZipEntry = { name: string; bytes?: Uint8Array; text?: string };
function buildStoreZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder(); const locals: Uint8Array[] = []; const centrals: Uint8Array[] = []; let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(safeZipPath(entry.name)); const bytes = entry.bytes ?? encoder.encode(entry.text ?? ''); const crc = crc32(bytes);
    const local = concat([u32le(0x04034b50),u16le(20),u16le(0x0800),u16le(0),u16le(0),u16le(0x21),u32le(crc),u32le(bytes.length),u32le(bytes.length),u16le(name.length),u16le(0),name,bytes]);
    locals.push(local);
    centrals.push(concat([u32le(0x02014b50),u16le(20),u16le(20),u16le(0x0800),u16le(0),u16le(0),u16le(0x21),u32le(crc),u32le(bytes.length),u32le(bytes.length),u16le(name.length),u16le(0),u16le(0),u16le(0),u16le(0),u32le(0),u32le(offset),name]));
    offset += local.length;
  }
  const central = concat(centrals); const end = concat([u32le(0x06054b50),u16le(0),u16le(0),u16le(entries.length),u16le(entries.length),u32le(central.length),u32le(offset),u16le(0)]);
  return concat([...locals, central, end]);
}
function safeZipPath(value: string): string { return value.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.' && part !== '..').map((part) => part.replace(/[<>:"|?*\u0000-\u001f]/g, '_')).join('/'); }
function u16le(value:number):Uint8Array{return new Uint8Array([value&255,(value>>>8)&255]);}
function u32le(value:number):Uint8Array{return new Uint8Array([value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255]);}
function concat(parts:readonly Uint8Array[]):Uint8Array{const out=new Uint8Array(parts.reduce((sum,part)=>sum+part.length,0));let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;}
const CRC_TABLE=(()=>{const table=new Uint32Array(256);for(let index=0;index<256;index++){let value=index;for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;table[index]=value>>>0;}return table;})();
function crc32(bytes:Uint8Array):number{let value=0xffffffff;for(const byte of bytes)value=CRC_TABLE[(value^byte)&255]!^(value>>>8);return(value^0xffffffff)>>>0;}
