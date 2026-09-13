import type { PageSettings } from './pageModel.ts';
import { pagePixelSize, pageSizeMm } from './pageModel.ts';

export type MaterializedRenderPage = {
  id: string;
  builderPageId: string;
  builderPageName: string;
  builderPageIndex: number;
  continuationIndex: number;
  documentPageIndex: number;
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
};

export type MaterializedRenderDocument = {
  version: 'DB-4.5A-v1';
  name: string;
  totalPages: number;
  pages: MaterializedRenderPage[];
  createdAt: string;
};

export type MaterializedBuilderPageInput = {
  id: string;
  name: string;
  settings: PageSettings;
  outputPageCount: number;
};

/**
 * DB-4.5A shared physical-page manifest.
 *
 * The Builder already owns body-flow and table pagination. This manifest freezes
 * that result into a document-wide ordered list of physical output pages. Preview
 * and exact-PDF export use these same page identities/order instead of running a
 * second pagination algorithm.
 */
export function buildMaterializedRenderDocument(name: string, builderPages: MaterializedBuilderPageInput[]): MaterializedRenderDocument {
  const pages: MaterializedRenderPage[] = [];
  let documentPageIndex = 0;
  builderPages.forEach((page, builderPageIndex) => {
    const pixels = pagePixelSize(page.settings);
    const mm = pageSizeMm(page.settings);
    const count = Math.max(1, Math.floor(page.outputPageCount || 1));
    for (let continuationIndex = 0; continuationIndex < count; continuationIndex += 1) {
      pages.push({
        id: `${page.id}::${continuationIndex}`,
        builderPageId: page.id,
        builderPageName: page.name,
        builderPageIndex,
        continuationIndex,
        documentPageIndex,
        widthPx: pixels.width,
        heightPx: pixels.height,
        widthMm: mm.widthMm,
        heightMm: mm.heightMm,
      });
      documentPageIndex += 1;
    }
  });
  return { version: 'DB-4.5A-v1', name, totalPages: pages.length, pages, createdAt: new Date().toISOString() };
}
