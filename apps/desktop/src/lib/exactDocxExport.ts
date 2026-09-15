import { buildRasterDocx, type RasterDocxPage } from '@document-tool/renderer-docx';
import { captureMaterializedPageAsJpeg } from './exactPdfExport.ts';
import type { MaterializedRenderDocument, MaterializedRenderPage } from './materializedRenderModel.ts';

export type ExactDocxExportProgress = { current: number; total: number; page: MaterializedRenderPage };
export type ExactDocxExportOptions = { dpi?: number; quality?: number; onProgress?: (progress: ExactDocxExportProgress) => void };

export async function buildExactPreviewDocx(
  model: MaterializedRenderDocument,
  resolvePageNode: (page: MaterializedRenderPage) => Promise<HTMLElement>,
  options: ExactDocxExportOptions = {},
): Promise<Uint8Array> {
  const pages: RasterDocxPage[] = [];
  for (let index = 0; index < model.pages.length; index += 1) {
    const page = model.pages[index]!;
    const node = await resolvePageNode(page);
    const raster = await captureMaterializedPageAsJpeg(node, page, { dpi: options.dpi ?? 192, quality: options.quality ?? 0.96 });
    pages.push({ bytes: raster.bytes, widthMm: page.widthMm, heightMm: page.heightMm, name: `${page.builderPageName} ${page.continuationIndex + 1}` });
    options.onProgress?.({ current: index + 1, total: model.pages.length, page });
  }
  return buildRasterDocx(pages, { title: model.name, creator: 'Document Builder' });
}

export function downloadDocx(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName.toLowerCase().endsWith('.docx') ? fileName : `${fileName}.docx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
