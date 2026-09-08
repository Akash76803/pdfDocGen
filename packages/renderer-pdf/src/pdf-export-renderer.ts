import type { DocumentRenderer, RendererCapabilities, RendererRequest, RendererResult } from '@document-tool/renderer-sdk';
import { PdfRenderer } from './pdf-renderer.js';

export class PdfExportRenderer implements DocumentRenderer {
  readonly format='PDF' as const;
  readonly version='4.19.1';
  readonly capabilities:RendererCapabilities={supportsPagination:true,supportsVectorText:true,supportsEditableText:false,supportsTransparency:false,supportsPageNumbers:true,supportsPasswordProtection:false,supportsMixedPageSizes:true};
  constructor(private readonly renderer=new PdfRenderer()){}
  async render(request:RendererRequest):Promise<RendererResult>{
    request.cancellationToken.throwIfCancellationRequested();let pageCount:number|undefined;
    const output=await this.renderer.render(request.document.template,request.document.model,{fileNamePrefix:request.fileName,options:{...request.options,onDiagnostics:(diagnostics:{pageCount:number})=>{pageCount=diagnostics.pageCount;}}});
    request.cancellationToken.throwIfCancellationRequested();return{files:[{fileName:output.fileName,mimeType:output.mimeType,bytes:output.content}],pageCount,warnings:[]};
  }
}
