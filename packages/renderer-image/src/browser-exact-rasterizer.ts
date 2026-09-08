import html2canvasModule, { type Options as Html2CanvasOptions } from 'html2canvas';
import type { ResolvedExportDocument } from '@document-tool/renderer-sdk';
import type { PhysicalPageRasterizer, PngDpi, RasterPage } from './png-renderer.js';

export type ExactPageProvider=(document:ResolvedExportDocument)=>Promise<readonly HTMLElement[]>|readonly HTMLElement[];
const html2canvas=((html2canvasModule as unknown as {default?:unknown}).default??html2canvasModule) as unknown as (element:HTMLElement,options?:Partial<Html2CanvasOptions>)=>Promise<HTMLCanvasElement>;

/**
 * Rasterizes the isolated physical Exact page directly from DOM. SVG
 * foreignObject serialization is deliberately avoided because WebView2 marks
 * those canvases as cross-origin/tainted even after resources are inlined.
 */
export class BrowserExactPageRasterizer implements PhysicalPageRasterizer {
  constructor(
    private readonly pages:ExactPageProvider,
    private readonly transparentBackground:(document:ResolvedExportDocument)=>boolean=()=>false,
    private readonly host: HTMLElement | Document = document
  ){}
  async getPageCount(document:ResolvedExportDocument):Promise<number>{return(await this.pages(document)).length;}
  async rasterizePage(document:ResolvedExportDocument,pageIndex:number,width:number,height:number,dpi:PngDpi):Promise<RasterPage>{
    const nodes=await this.pages(document);const node=nodes[pageIndex];if(!node)throw new Error(`Exact page ${pageIndex+1} is unavailable.`);
    await decodeImages(node);
    const token=`export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    node.dataset.rasterCaptureToken=token;
    
    assertNoUnsafeCss(node);
    
    try{
      const captured=await html2canvas(node,{
        backgroundColor:null,
        scale:dpi/96,
        useCORS:true,
        allowTaint:false,
        logging:false,
        imageTimeout:15000,
        foreignObjectRendering:false,
        removeContainer:true,
        onclone:(clonedDocument:Document)=>{
          const clone=clonedDocument.querySelector<HTMLElement>(`[data-raster-capture-token="${token}"]`);
          if(!clone)return;
          clone.style.transform='none';clone.style.zoom='1';clone.style.boxShadow='none';clone.style.margin='0';
          if(this.transparentBackground(document)){clone.style.setProperty('background','transparent','important');clone.style.setProperty('--page-bg','transparent');}
        },
      });
      const output=node.ownerDocument.createElement('canvas');output.width=width;output.height=height;
      const context=output.getContext('2d',{alpha:true,willReadFrequently:true});if(!context)throw new Error('Canvas 2D is unavailable.');
      context.drawImage(captured,0,0,width,height);
      const data=context.getImageData(0,0,width,height);
      return{width,height,rgba:new Uint8Array(data.data.buffer.slice(0))};
    }finally{
      delete node.dataset.rasterCaptureToken;
    }
  }

  async rasterizeElement(documentGroupId: string, elementId: string, dpi = 300): Promise<{ bytes: Uint8Array; width: number; height: number; mimeType: string }> {
    const root = this.host.querySelector(`.raster-export-root [data-document-id="${documentGroupId}"]`);
    if (!root) throw new Error(`Isolated export page root for ${documentGroupId} is unavailable.`);
    const target = root.querySelector(`[data-element-id="${elementId}"]`);
    if (!target) throw new Error(`SVG export element not found: ${elementId}`);

    const token=`export-el-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    (target as HTMLElement).dataset.rasterCaptureToken=token;
    
    assertNoUnsafeCss(target as HTMLElement);
    await decodeImages(target as HTMLElement);
    // Give browser a frame to apply any pending SVG paints
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    
    try {
      const captured = await html2canvas(target as HTMLElement, {
        backgroundColor: null,
        scale: dpi / 96,
        useCORS: true,
        allowTaint: false,
        logging: false,
        foreignObjectRendering: false,
        removeContainer: true,
        onclone: (clonedDocument: Document) => {
          const clone = clonedDocument.querySelector<HTMLElement>(`[data-raster-capture-token="${token}"]`);
          if (!clone) return;
          clone.style.transform = 'none';
          clone.style.margin = '0';
        }
      });
      
      const width = captured.width;
      const height = captured.height;
      
      if (width === 0 || height === 0) throw new Error(`SVG fallback produced empty raster (zero size): ${elementId}`);
      
      const output = document.createElement('canvas');
      output.width = width;
      output.height = height;
      const context = output.getContext('2d');
      if (!context) throw new Error('Canvas 2D is unavailable.');
      
      // Composite against page background to simulate transparency support for JPEG PDF
      const bgHex = (root as HTMLElement).style.backgroundColor || '#ffffff';
      context.fillStyle = bgHex;
      context.fillRect(0, 0, width, height);
      context.drawImage(captured, 0, 0);
      
      const bytes = await new Promise<Uint8Array>((resolve, reject) => {
        output.toBlob((blob) => {
          if (!blob) return reject(new Error('Canvas toBlob failed'));
          blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf))).catch(reject);
        }, 'image/jpeg', 0.95);
      });
      
      if (bytes.length < 10) throw new Error(`SVG fallback produced empty raster (no bytes): ${elementId}`);
      
      return { bytes, width, height, mimeType: 'image/jpeg' };
    } finally {
      delete (target as HTMLElement).dataset.rasterCaptureToken;
    }
  }

  async rasterizePageAsJpeg(documentGroupId: string, dpi = 300): Promise<{ bytes: Uint8Array; width: number; height: number; mimeType: string }> {
    const root = this.host.querySelector(`.raster-export-root [data-document-id="${documentGroupId}"]`);
    if (!root) throw new Error(`Isolated export page root for ${documentGroupId} is unavailable.`);
    const target = root.querySelector(`[data-document-export-page]`);
    if (!target) throw new Error(`Export page element not found for artboard: ${documentGroupId}`);

    const token=`export-page-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    (target as HTMLElement).dataset.rasterCaptureToken=token;
    
    assertNoUnsafeCss(target as HTMLElement);
    await decodeImages(target as HTMLElement);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    
    try {
      const captured = await html2canvas(target as HTMLElement, {
        backgroundColor: null,
        scale: dpi / 96,
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 15000,
        foreignObjectRendering: false,
        removeContainer: true,
        onclone: (clonedDocument: Document) => {
          const clone = clonedDocument.querySelector<HTMLElement>(`[data-raster-capture-token="${token}"]`);
          if (!clone) return;
          clone.style.transform = 'none';
          clone.style.zoom = '1';
          clone.style.boxShadow = 'none';
          clone.style.margin = '0';
        },
      });
      
      const width = captured.width;
      const height = captured.height;
      if (width === 0 || height === 0) throw new Error(`Page rasterization produced empty output for artboard: ${documentGroupId}`);
      
      const output = document.createElement('canvas');
      output.width = width;
      output.height = height;
      const context = output.getContext('2d');
      if (!context) throw new Error('Canvas 2D is unavailable.');
      
      // Page background
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(captured, 0, 0);
      
      const bytes = await new Promise<Uint8Array>((resolve, reject) => {
        output.toBlob((blob) => {
          if (!blob) return reject(new Error('Canvas toBlob failed'));
          blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf))).catch(reject);
        }, 'image/jpeg', 0.95);
      });
      
      if (bytes.length < 10) throw new Error(`Page raster produced zero bytes for artboard: ${documentGroupId}`);
      return { bytes, width, height, mimeType: 'image/jpeg' };
    } finally {
      delete (target as HTMLElement).dataset.rasterCaptureToken;
    }
  }
}

async function decodeImages(root:HTMLElement):Promise<void>{await Promise.all(Array.from(root.querySelectorAll('img')).map(async image=>{try{if(typeof image.decode==='function')await image.decode();}catch{/* html2canvas skips unsafe/unavailable resources */}}));}

function assertNoUnsafeCss(root: HTMLElement): void {
  const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (const node of all) {
    if (node.style) {
      for (let i = 0; i < node.style.length; i++) {
        const prop = node.style[i];
        if (!prop) continue;
        const val = node.style.getPropertyValue(prop);
        if (val && (val.includes('color(') || val.includes('var('))) {
          throw new Error(`Unsafe export style remained: ${prop}="${val}" on ${node.tagName}`);
        }
      }
    }
    
    if (node instanceof SVGElement || node instanceof SVGGraphicsElement) {
      const fill = node.getAttribute('fill');
      if (fill && (fill.includes('color(') || fill.includes('var('))) {
        throw new Error(`Unsafe export SVG attr remained: fill="${fill}" on ${node.tagName}`);
      }
      const stroke = node.getAttribute('stroke');
      if (stroke && (stroke.includes('color(') || stroke.includes('var('))) {
        throw new Error(`Unsafe export SVG attr remained: stroke="${stroke}" on ${node.tagName}`);
      }
    }
  }
}
