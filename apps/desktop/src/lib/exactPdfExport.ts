import html2canvas from 'html2canvas';
import { buildPdf, type PdfImage, type PdfPage } from '@document-tool/renderer-pdf';
import type { MaterializedRenderDocument, MaterializedRenderPage } from './materializedRenderModel.ts';

const PT_PER_MM = 72 / 25.4;
const mmToPt = (value: number) => value * PT_PER_MM;
const fixed = (value: number) => value.toFixed(2);

export type ExactPdfExportProgress = {
  current: number;
  total: number;
  page: MaterializedRenderPage;
};

export type ExactPdfExportOptions = {
  dpi?: number;
  quality?: number;
  onProgress?: (progress: ExactPdfExportProgress) => void;
};

export async function captureMaterializedPageAsJpeg(
  node: HTMLElement,
  page: MaterializedRenderPage,
  options: ExactPdfExportOptions = {},
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  await decodeImages(node);
  const dpi = Math.max(96, options.dpi ?? 192);
  const scale = dpi / 96;
  const token = `db45-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  node.dataset.db45ExportToken = token;

  // DB-4.5B Fix4: html2canvas resolves generated ::before/::after content from
  // the LIVE document before/while building its clone. Removing the authoring
  // class only inside `onclone` is therefore too late on some Chromium builds:
  // the `Repeated` pill may already be materialized in html2canvas' render tree.
  // Temporarily strip the authoring marker from the live page *before* capture,
  // then restore it immediately after export. This changes no React state and
  // does not affect layout because the class only supplies editor chrome.
  const liveRepeatedItems = Array.from(node.querySelectorAll<HTMLElement>('[data-repeated-projection="true"], .repeated-region-projection'));
  const repeatedSnapshots = liveRepeatedItems.map((item) => ({
    item,
    hadClass: item.classList.contains('repeated-region-projection'),
    dataValue: item.getAttribute('data-repeated-projection'),
  }));
  repeatedSnapshots.forEach(({ item }) => {
    item.classList.remove('repeated-region-projection');
    item.setAttribute('data-repeated-projection', 'false');
  });
  // Give the browser one paint opportunity so generated content is invalidated
  // before html2canvas reads computed styles.
  await nextAnimationFrame();
  try {
    const canvas = await html2canvas(node, {
      backgroundColor: '#ffffff',
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      imageTimeout: 15000,
      foreignObjectRendering: false,
      removeContainer: true,
      width: page.widthPx,
      height: page.heightPx,
      windowWidth: page.widthPx,
      windowHeight: page.heightPx,
      onclone: (doc) => {
        const clone = doc.querySelector<HTMLElement>(`[data-db45-export-token="${token}"]`);
        if (!clone) return;
        clone.style.transform = 'none';
        clone.style.transformOrigin = 'top left';
        clone.style.boxShadow = 'none';
        clone.style.margin = '0';
        clone.style.width = `${page.widthPx}px`;
        clone.style.height = `${page.heightPx}px`;
        // Header/Footer `Repeated` pills are authoring-only pseudo-elements attached
        // to `.repeated-region-projection`. html2canvas can snapshot generated content
        // before late stylesheet overrides are reflected, so the reliable export path
        // is to remove the authoring class from the cloned elements themselves. The
        // data marker is also cleared so future export-only selectors cannot recreate it.
        clone.querySelectorAll<HTMLElement>('[data-repeated-projection="true"], .repeated-region-projection').forEach((item) => {
          item.classList.remove('repeated-region-projection');
          item.dataset.repeatedProjection = 'false';
        });
        // Keep a defensive clone-only CSS rule as a second guard in case another
        // authoring rule starts rendering a repeat badge from the data attribute.
        const exportStyle = doc.createElement('style');
        exportStyle.dataset.db45ExportCleanup = 'true';
        exportStyle.textContent = `
          [data-db45-export-token] .repeated-region-projection::before,
          [data-db45-export-token] .repeated-region-projection::after,
          [data-db45-export-token] [data-repeated-projection="true"]::before,
          [data-db45-export-token] [data-repeated-projection="true"]::after {
            content: none !important;
            display: none !important;
          }
        `;
        doc.head.appendChild(exportStyle);
        clone.querySelectorAll('.page-margin-guide,.page-safe-guide,.page-band-guide,.page-bleed-guide,.selection-label,.resize-handle,.db-column-ruler,.db-column-resize-handle').forEach((item) => item.remove());
        clone.querySelectorAll<HTMLElement>('.canvas-element.selected').forEach((item) => item.classList.remove('selected'));
        clone.querySelectorAll<HTMLElement>('.selected-db-cell').forEach((item) => item.classList.remove('selected-db-cell'));
      },
    });
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Unable to encode preview page.')), 'image/jpeg', options.quality ?? 0.96));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
  } finally {
    repeatedSnapshots.forEach(({ item, hadClass, dataValue }) => {
      if (hadClass) item.classList.add('repeated-region-projection');
      if (dataValue === null) item.removeAttribute('data-repeated-projection');
      else item.setAttribute('data-repeated-projection', dataValue);
    });
    delete node.dataset.db45ExportToken;
  }
}

export async function buildExactPreviewPdf(
  model: MaterializedRenderDocument,
  resolvePageNode: (page: MaterializedRenderPage) => Promise<HTMLElement>,
  options: ExactPdfExportOptions = {},
): Promise<Uint8Array> {
  const pdfPages: PdfPage[] = [];
  const images: PdfImage[] = [];
  for (let index = 0; index < model.pages.length; index += 1) {
    const page = model.pages[index]!;
    const node = await resolvePageNode(page);
    const raster = await captureMaterializedPageAsJpeg(node, page, options);
    const imageName = `DB45Page${index + 1}`;
    images.push({ name: imageName, bytes: raster.bytes, width: raster.width, height: raster.height });
    const width = mmToPt(page.widthMm);
    const height = mmToPt(page.heightMm);
    pdfPages.push({ width, height, ops: [`q ${fixed(width)} 0 0 ${fixed(height)} 0 0 cm /${imageName} Do Q`] });
    options.onProgress?.({ current: index + 1, total: model.pages.length, page });
  }
  return buildPdf(pdfPages, images);
}

export function downloadPdf(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

async function decodeImages(root: HTMLElement) {
  await Promise.all(Array.from(root.querySelectorAll('img')).map(async (image) => {
    try { if (typeof image.decode === 'function') await image.decode(); } catch { /* capture fallback */ }
  }));
}
