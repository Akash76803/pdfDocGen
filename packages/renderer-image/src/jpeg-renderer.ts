import { resolvePageGeometry } from '@document-tool/renderer-sdk';
import type { DocumentRenderer, RendererCapabilities, RendererRegistry, RendererRequest, RendererResult } from '@document-tool/renderer-sdk';
import type { PhysicalPageRasterizer } from './png-renderer.js';
import { estimateImageMemory, ImageSafetyError } from './png-renderer.js';
import { BrowserJpegEncoder, type JpegEncoder } from './jpeg-encoder.js';
import { flattenRgba, parseHexColor } from './raster-background.js';
import { selectedPageIndices, validateDpi, type RasterExportOptions } from './raster-options.js';

export interface JpegExportOptions extends RasterExportOptions { quality?:number; backgroundColor?:string; }
const DEFAULT_MAX_PIXELS=80_000_000;
const DEFAULT_MAX_MEMORY=512*1024*1024;

export class JpegRenderer implements DocumentRenderer {
  readonly format='JPEG' as const;
  readonly version='4.19.3';
  readonly capabilities:RendererCapabilities={supportsPagination:true,supportsVectorText:false,supportsEditableText:false,supportsTransparency:false,supportsPageNumbers:true,supportsPasswordProtection:false,supportsMixedPageSizes:true};
  constructor(private readonly rasterizer:PhysicalPageRasterizer,private readonly encoder:JpegEncoder=new BrowserJpegEncoder()){}
  async render(request:RendererRequest):Promise<RendererResult>{
    request.cancellationToken.throwIfCancellationRequested();
    const options=(request.options?.jpeg??{}) as JpegExportOptions;
    const dpi=options.dpi??300;validateDpi(dpi,'JPEG');
    const quality=options.quality??90;
    if(!Number.isFinite(quality)||quality<60||quality>100)throw new Error('Invalid JPEG quality. Use a value from 60 to 100.');
    const backgroundColor=(options.backgroundColor??'#FFFFFF').toUpperCase();
    const background=parseHexColor(backgroundColor);
    const pageCount=await this.rasterizer.getPageCount(request.document);
    if(pageCount<1)throw new Error('The resolved document has no physical pages.');
    const indices=selectedPageIndices(pageCount,options);
    const page=request.document.model.page??request.document.template.page;
    const geometry=resolvePageGeometry(page);
    const estimate=estimateImageMemory(geometry.widthMm,geometry.heightMm,dpi,indices.length);
    if(estimate.pixelsPerPage>(options.maxPixels??DEFAULT_MAX_PIXELS))throw new ImageSafetyError(`JPEG page is ${estimate.width} × ${estimate.height} (${estimate.pixelsPerPage.toLocaleString()} pixels). Reduce DPI.`);
    if(estimate.estimatedBytes>(options.maxEstimatedMemoryBytes??DEFAULT_MAX_MEMORY))throw new ImageSafetyError(`Estimated JPEG raster memory is ${Math.ceil(estimate.estimatedBytes/1048576)} MB. Reduce DPI or export fewer pages.`);
    const files=[];
    for(const [selectionIndex,pageIndex] of indices.entries()){
      request.cancellationToken.throwIfCancellationRequested();
      const raster=await this.rasterizer.rasterizePage(request.document,pageIndex,estimate.width,estimate.height,dpi);
      if(raster.width!==estimate.width||raster.height!==estimate.height)throw new Error('Rasterizer returned dimensions that do not match physical page geometry.');
      const rgb=flattenRgba(raster.rgba,background);
      request.cancellationToken.throwIfCancellationRequested();
      files.push({fileName:`${request.fileName}_page_${String(pageIndex+1).padStart(3,'0')}.jpg`,mimeType:'image/jpeg',bytes:await this.encoder.encode(raster.width,raster.height,rgb,quality)});
      request.onPageProgress?.(selectionIndex+1,indices.length);
      await Promise.resolve();
    }
    return{files,pageCount:indices.length,warnings:[],diagnostics:{dpi,quality,backgroundColor}};
  }
}
export function registerJpegRenderer(registry:RendererRegistry,rasterizer:PhysicalPageRasterizer,encoder?:JpegEncoder):JpegRenderer{const renderer=new JpegRenderer(rasterizer,encoder);registry.register('JPEG',renderer);return renderer;}
