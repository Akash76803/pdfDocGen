import type { ExportedFile } from '@document-tool/renderer-sdk';
import { buildPdf, type PdfPage, type PdfImage } from '@document-tool/renderer-pdf';

export interface CombinedPdfAccumulator {
  addPage(
    rasterResult: { bytes: Uint8Array; width: number; height: number },
    widthMm: number,
    heightMm: number,
    pageIndex: number
  ): void;
  build(filenameTemplate: string): ExportedFile | null;
}

const PT_PER_MM = 72 / 25.4;
const f = (n: number) => n.toFixed(2);
const mm = (v: number) => v * PT_PER_MM;

export function createCombinedPdfAccumulator(): CombinedPdfAccumulator {
  const pages: PdfPage[] = [];
  const images: PdfImage[] = [];
  let pageCount = 0;

  return {
    addPage(rasterResult, widthMm, heightMm, pageIndex) {
      const pageW = mm(widthMm);
      const pageH = mm(heightMm);
      
      const imgName = `Img_${pageIndex}`;
      
      images.push({ 
        name: imgName, 
        bytes: rasterResult.bytes, 
        width: rasterResult.width, 
        height: rasterResult.height 
      });
      
      const ops: string[] = [];
      ops.push(`q ${f(pageW)} 0 0 ${f(pageH)} 0 0 cm /${imgName} Do Q`);
      
      pages.push({ width: pageW, height: pageH, ops });
      pageCount++;
    },
    
    build(filenameTemplate: string): ExportedFile | null {
      if (pages.length === 0) return null;
      
      const bytes = buildPdf(pages, images);
      
      const safeName = filenameTemplate.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Combined_Bulk_Export';
      const finalFileName = safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
      
      return {
        fileName: finalFileName,
        mimeType: 'application/pdf',
        bytes
      };
    }
  };
}
