export type RasterDocxPage = {
  bytes: Uint8Array;
  widthMm: number;
  heightMm: number;
  name?: string;
};

export type RasterDocxOptions = {
  title?: string;
  creator?: string;
};

const XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
const MM_TO_TWIP = 1440 / 25.4;
const MM_TO_EMU = 36000;

/**
 * DB-4.5C exact Preview → DOCX v1.
 *
 * The already-materialized Preview page is the layout authority. Each physical
 * Preview page is captured as a high-resolution JPEG and placed at page origin
 * in a matching Word section. Word therefore does not independently paginate
 * Body Flow / Dynamic Tables and cannot move content to different pages.
 *
 * This v1 prioritizes parity. Native editable DOCX blocks can be layered on the
 * same materialized page contract in a later phase without changing pagination.
 */
export function buildRasterDocx(pages: readonly RasterDocxPage[], options: RasterDocxOptions = {}): Uint8Array {
  if (!pages.length) throw new Error('Cannot build a DOCX without pages.');
  const files: ZipEntry[] = [];
  const imageRels: string[] = [];
  const body: string[] = [];

  pages.forEach((page, index) => {
    const mediaName = `page-${index + 1}.jpg`;
    const relId = `rIdImage${index + 1}`;
    files.push({ name: `word/media/${mediaName}`, bytes: page.bytes });
    imageRels.push(`<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaName}"/>`);
    body.push(pageParagraph(page, relId, index + 1, index < pages.length - 1));
  });

  // Last section properties live at body level. Earlier sections are attached to
  // their image paragraph as next-page section breaks.
  body.push(sectionProperties(pages[pages.length - 1]!, false));

  files.push({ name: '[Content_Types].xml', text: contentTypesXml() });
  files.push({ name: '_rels/.rels', text: rootRelsXml() });
  files.push({ name: 'docProps/core.xml', text: coreXml(options) });
  files.push({ name: 'docProps/app.xml', text: appXml(pages.length) });
  files.push({ name: 'word/document.xml', text: documentXml(body.join('')) });
  files.push({ name: 'word/_rels/document.xml.rels', text: documentRelsXml(imageRels.join('')) });
  files.push({ name: 'word/styles.xml', text: stylesXml() });
  files.push({ name: 'word/settings.xml', text: settingsXml() });

  return buildStoreZip(files);
}

function pageParagraph(page: RasterDocxPage, relId: string, index: number, sectionBreak: boolean): string {
  const cx = Math.max(1, Math.round(page.widthMm * MM_TO_EMU));
  const cy = Math.max(1, Math.round(page.heightMm * MM_TO_EMU));
  const sect = sectionBreak ? sectionProperties(page, true) : '';
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/>${sect}</w:pPr><w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${1000 + index}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${index}" name="Preview Page ${index}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${index}" name="Preview Page ${index}.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;
}

function sectionProperties(page: RasterDocxPage, nextPage: boolean): string {
  const w = Math.max(1, Math.round(page.widthMm * MM_TO_TWIP));
  const h = Math.max(1, Math.round(page.heightMm * MM_TO_TWIP));
  const orient = w > h ? ' w:orient="landscape"' : '';
  return `<w:sectPr>${nextPage ? '<w:type w:val="nextPage"/>' : ''}<w:pgSz w:w="${w}" w:h="${h}"${orient}/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/><w:cols w:space="0"/><w:docGrid w:linePitch="360"/></w:sectPr>`;
}

function documentXml(body: string): string {
  return `${XML}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}</w:body></w:document>`;
}
function contentTypesXml(): string { return `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`; }
function rootRelsXml(): string { return `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`; }
function documentRelsXml(images: string): string { return `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${images}</Relationships>`; }
function stylesXml(): string { return `${XML}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:rPr><w:sz w:val="2"/></w:rPr></w:style></w:styles>`; }
function settingsXml(): string { return `${XML}<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:doNotTrackMoves/><w:doNotTrackFormatting/></w:settings>`; }
function coreXml(options: RasterDocxOptions): string { const title = xmlEscape(options.title || 'Document'); const creator = xmlEscape(options.creator || 'Document Builder'); const now = new Date().toISOString(); return `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${title}</dc:title><dc:creator>${creator}</dc:creator><cp:lastModifiedBy>${creator}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`; }
function appXml(pageCount: number): string { return `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Document Builder</Application><Pages>${pageCount}</Pages><Company></Company><AppVersion>1.0</AppVersion></Properties>`; }
function xmlEscape(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }

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
