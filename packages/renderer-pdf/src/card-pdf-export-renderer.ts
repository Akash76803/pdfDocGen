import type { DocumentRenderer, RendererCapabilities, RendererRequest, RendererResult } from '@document-tool/renderer-sdk';
import { buildPdf, type PdfPage, type PdfImage } from './pdf-renderer.js';

const PT_PER_MM = 72 / 25.4;
const f = (n: number) => n.toFixed(2);
const mm = (v: number) => v * PT_PER_MM;

export type PageRasterizer = (documentGroupId: string, dpi: number) => Promise<{ bytes: Uint8Array; width: number; height: number; mimeType: string }>;

export class CardPdfExportRenderer implements DocumentRenderer {
  readonly format = 'PDF' as const;
  readonly version = '1.0.0';
  readonly capabilities: RendererCapabilities = {
    supportsPagination: true,
    supportsVectorText: false,
    supportsEditableText: false,
    supportsTransparency: false,
    supportsPageNumbers: false,
    supportsPasswordProtection: false,
    supportsMixedPageSizes: true
  };

  constructor(private readonly pageRasterizer?: PageRasterizer) {}

  async render(request: RendererRequest): Promise<RendererResult> {
    request.cancellationToken.throwIfCancellationRequested();
    
    if (!this.pageRasterizer) {
      throw new Error('PDF export requires a page rasterizer in this configuration.');
    }

    const images: PdfImage[] = [];
    const pages: PdfPage[] = [];

    const docModel = request.document.model as any; 
    const bleed = docModel.bleedMm || 0;
    const widthMm = (docModel.trimWidthMm || 210) + (bleed * 2);
    const heightMm = (docModel.trimHeightMm || 297) + (bleed * 2);
    
    const pageW = mm(widthMm);
    const pageH = mm(heightMm);
    
    // Rasterize full page
    const exportReqDpi = (request.options?.pdf as any)?.dpi || 300;
    const rasterResult = await this.pageRasterizer(request.document.documentGroupId, exportReqDpi);
    
    const imgName = `PageImage`;
    images.push({ name: imgName, bytes: rasterResult.bytes, width: rasterResult.width, height: rasterResult.height });
    
    const ops: string[] = [];
    ops.push(`q ${f(pageW)} 0 0 ${f(pageH)} 0 0 cm /${imgName} Do Q`);
    
    pages.push({ width: pageW, height: pageH, ops });

    const bytes = buildPdf(pages, images);
    
    const baseFileName = request.fileName || 'Card_Export';
    const finalFileName = baseFileName.toLowerCase().endsWith('.pdf') ? baseFileName : `${baseFileName}.pdf`;
    
    return {
      files: [{ fileName: finalFileName, mimeType: 'application/pdf', bytes }],
      pageCount: pages.length,
      warnings: []
    };
  }
}
