export const RASTER_DPI_PRESETS=[96,150,300,600] as const;
export type SupportedDpi=typeof RASTER_DPI_PRESETS[number];
export interface RasterExportOptions {dpi?:SupportedDpi;pageSelection?:'CURRENT'|'ALL';currentPageIndex?:number;maxPixels?:number;maxEstimatedMemoryBytes?:number;}
export function validateDpi(dpi:number,format='raster'):asserts dpi is SupportedDpi{if(!RASTER_DPI_PRESETS.includes(dpi as SupportedDpi))throw new Error(`Invalid ${format} DPI ${dpi}. Use 96, 150, 300, or 600.`);}
export function selectedPageIndices(pageCount:number,options:RasterExportOptions):number[]{return options.pageSelection==='CURRENT'?[Math.min(pageCount-1,Math.max(0,options.currentPageIndex??0))]:Array.from({length:pageCount},(_,index)=>index);}
