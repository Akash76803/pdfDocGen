import { resolvePageGeometry } from '@document-tool/renderer-sdk';
import type { DocumentRenderer, RendererCapabilities, RendererRegistry, RendererRequest, RendererResult, ResolvedExportDocument } from '@document-tool/renderer-sdk';
import { defaultPngEncoder, type PngEncoder } from './png-encoder.js';
import { RASTER_DPI_PRESETS,selectedPageIndices,validateDpi,type RasterExportOptions,type SupportedDpi } from './raster-options.js';

export const PNG_DPI_PRESETS=RASTER_DPI_PRESETS;
export type PngDpi=SupportedDpi;
export interface RasterPage { width:number;height:number;rgba:Uint8Array; }
/** Implemented by the Exact presentation surface; pageIndex is zero-based. */
export interface PhysicalPageRasterizer { getPageCount(document:ResolvedExportDocument):Promise<number>; rasterizePage(document:ResolvedExportDocument,pageIndex:number,width:number,height:number,dpi:PngDpi):Promise<RasterPage>; }
export interface PngExportOptions extends RasterExportOptions {backgroundMode?:'TEMPLATE'|'TRANSPARENT';pages?:'CURRENT'|'ALL';currentPage?:number;}
export interface ImageMemoryEstimate {width:number;height:number;pageCount:number;pixelsPerPage:number;estimatedBytes:number;}
export class ImageSafetyError extends Error {readonly code='IMAGE_SAFETY_LIMIT' as const;constructor(message:string){super(message);this.name='ImageSafetyError';}}
const DEFAULT_MAX_PIXELS=80_000_000,DEFAULT_MAX_MEMORY=512*1024*1024;
export function estimateImageMemory(widthMm:number,heightMm:number,dpi:number,pageCount:number):ImageMemoryEstimate{const width=Math.max(1,Math.round(widthMm/25.4*dpi));const height=Math.max(1,Math.round(heightMm/25.4*dpi));const pixelsPerPage=width*height;return{width,height,pageCount,pixelsPerPage,estimatedBytes:pixelsPerPage*4*pageCount};}

export class PngRenderer implements DocumentRenderer {
  readonly format='PNG' as const;readonly version='4.19.2';
  readonly capabilities:RendererCapabilities={supportsPagination:true,supportsVectorText:false,supportsEditableText:false,supportsTransparency:true,supportsPageNumbers:true,supportsPasswordProtection:false,supportsMixedPageSizes:true};
  constructor(private readonly rasterizer:PhysicalPageRasterizer,private readonly encoder:PngEncoder=defaultPngEncoder()){}
  async render(request:RendererRequest):Promise<RendererResult>{
    request.cancellationToken.throwIfCancellationRequested();const options=(request.options?.png??{}) as PngExportOptions;const dpi=options.dpi??300;validateDpi(dpi,'PNG');
    const pageCount=await this.rasterizer.getPageCount(request.document);if(pageCount<1)throw new Error('The resolved document has no physical pages.');
    const normalized={...options,pageSelection:options.pageSelection??options.pages,currentPageIndex:options.currentPageIndex??(options.currentPage!=null?options.currentPage-1:undefined)};const indices=selectedPageIndices(pageCount,normalized);
    const page=request.document.model.page??request.document.template.page;const geometry=resolvePageGeometry(page);const estimate=estimateImageMemory(geometry.widthMm,geometry.heightMm,dpi,indices.length);
    if(estimate.pixelsPerPage>(options.maxPixels??DEFAULT_MAX_PIXELS))throw new ImageSafetyError(`PNG page is ${estimate.width} × ${estimate.height} (${estimate.pixelsPerPage.toLocaleString()} pixels). Reduce DPI.`);
    if(estimate.estimatedBytes>(options.maxEstimatedMemoryBytes??DEFAULT_MAX_MEMORY))throw new ImageSafetyError(`Estimated PNG raster memory is ${Math.ceil(estimate.estimatedBytes/1048576)} MB. Reduce DPI or export fewer pages.`);
    const files=[];for(const [selectionIndex,pageIndex] of indices.entries()){request.cancellationToken.throwIfCancellationRequested();const raster=await this.rasterizer.rasterizePage(request.document,pageIndex,estimate.width,estimate.height,dpi);if(raster.width!==estimate.width||raster.height!==estimate.height)throw new Error('Rasterizer returned dimensions that do not match physical page geometry.');request.cancellationToken.throwIfCancellationRequested();files.push({fileName:`${request.fileName}_page_${String(pageIndex+1).padStart(3,'0')}.png`,mimeType:'image/png',bytes:await this.encoder.encode(raster.width,raster.height,raster.rgba)});request.onPageProgress?.(selectionIndex+1,indices.length);await Promise.resolve();}
    return{files,pageCount:indices.length,warnings:[],diagnostics:{dpi}};
  }
}
export function registerPngRenderer(registry:RendererRegistry,rasterizer:PhysicalPageRasterizer,encoder?:PngEncoder):PngRenderer{const renderer=new PngRenderer(rasterizer,encoder);registry.register('PNG',renderer);return renderer;}
