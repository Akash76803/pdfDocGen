import type { RenderModel, TemplateDefinition } from '@document-tool/contracts';

export type ExportFormat = 'PDF' | 'PNG' | 'JPEG' | 'DOCX';
export type FidelityLevel = 'EXACT' | 'HIGH' | 'APPROXIMATE';
export interface ExportOptions { fileNameTemplate?: string; [key: string]: unknown; }
export interface ExportRequest { format:ExportFormat; templateId:string; documentGroupIds:string[]; fileName?:string; options?:ExportOptions; }
export interface ExportedFile { fileName:string; mimeType:string; bytes:Uint8Array; }
export interface ExportWarning { code:string; message:string; documentGroupId?:string; fidelity?:FidelityLevel; }
export interface ExportDiagnostics { format:ExportFormat; documentCount:number; pageCount?:number; durationMs:number; fileSize:number; warningsCount:number; rendererVersion:string; fidelityVersion:string; dpi?:number; quality?:number; backgroundColor?:string; }
export interface ExportResult { format:ExportFormat; files:ExportedFile[]; documentCount:number; pageCount?:number; warnings:ExportWarning[]; diagnostics:ExportDiagnostics; }
export interface RendererCapabilities { supportsPagination:boolean; supportsVectorText:boolean; supportsEditableText:boolean; supportsTransparency:boolean; supportsPageNumbers:boolean; supportsPasswordProtection:boolean; supportsMixedPageSizes:boolean; }

export interface ExportCancellationToken { readonly isCancellationRequested:boolean; throwIfCancellationRequested():void; }
export class ExportCancelledError extends Error { readonly code='CANCELLED' as const; constructor(message='Export was cancelled.') { super(message); this.name='ExportCancelledError'; } }
export class ExportCancellationSource {
  private cancelled=false;
  readonly token:ExportCancellationToken;
  constructor() { const source=this; this.token={ get isCancellationRequested(){return source.cancelled;}, throwIfCancellationRequested(){if(source.cancelled) throw new ExportCancelledError();} }; }
  cancel():void { this.cancelled=true; }
}
export interface ExportProgress { phase:'RESOLVING'|'RENDERING'|'FINALIZING'; currentDocument:number; totalDocuments:number; documentGroupId?:string; pagesGenerated:number; percent:number; }
export interface ResolvedExportDocument { documentGroupId:string; template:TemplateDefinition; model:RenderModel; namingValues?:Record<string,unknown>; }
export interface RendererRequest { document:ResolvedExportDocument; fileName:string; options?:ExportOptions; cancellationToken:ExportCancellationToken; onPageProgress?:(currentPage:number,totalPages:number)=>void; }
export interface RendererResult { files:ExportedFile[]; pageCount?:number; warnings:ExportWarning[]; diagnostics?:{dpi?:number;quality?:number;backgroundColor?:string}; }
export interface DocumentRenderer { readonly format:ExportFormat; readonly capabilities:RendererCapabilities; readonly version:string; render(request:RendererRequest):Promise<RendererResult>; }

export class RendererRegistry {
  private readonly renderers=new Map<ExportFormat,DocumentRenderer>();
  register(format:ExportFormat,renderer:DocumentRenderer):void { if(renderer.format!==format) throw new Error(`Renderer format ${renderer.format} cannot be registered as ${format}.`); this.renderers.set(format,renderer); }
  get(format:ExportFormat):DocumentRenderer { const renderer=this.renderers.get(format); if(!renderer) throw new Error(`No renderer is registered for export format ${format}.`); return renderer; }
  capabilities(format:ExportFormat):RendererCapabilities { return this.get(format).capabilities; }
  has(format:ExportFormat):boolean { return this.renderers.has(format); }
}

const INVALID_FILE_CHARS=/[<>:"/\\|?*\u0000-\u001f]/g;
export class FileNamingService {
  render(template:string|undefined,values:Record<string,unknown>,fallback='document'):string { const expanded=(template||fallback).replace(/\{([^{}]+)\}/g,(_match,key:string)=>String(values[key]??'')); return this.sanitize(expanded,fallback); }
  sanitize(value:string,fallback='document'):string { const leaf=value.replace(/\\/g,'/').split('/').pop()||''; const safe=leaf.replace(INVALID_FILE_CHARS,'_').replace(/\.{2,}/g,'_').replace(/[. ]+$/g,'').trim(); return safe||fallback; }
  unique(value:string,used:Set<string>):string { if(!used.has(value.toLowerCase())){used.add(value.toLowerCase());return value;} const dot=value.lastIndexOf('.');const stem=dot>0?value.slice(0,dot):value;const extension=dot>0?value.slice(dot):'';let index=2;while(used.has(`${stem}_${index}${extension}`.toLowerCase()))index++;const unique=`${stem}_${index}${extension}`;used.add(unique.toLowerCase());return unique; }
}

export interface ExportOrchestratorDependencies { registry:RendererRegistry; resolveDocument(templateId:string,documentGroupId:string):Promise<ResolvedExportDocument>; naming?:FileNamingService; fidelityVersion?:string; }
export interface ExportExecutionOptions { cancellationToken?:ExportCancellationToken; onProgress?:(progress:ExportProgress)=>void; }
const NEVER_CANCELLED:ExportCancellationToken={isCancellationRequested:false,throwIfCancellationRequested(){}};
export class ExportOrchestrator {
  private readonly naming:FileNamingService;
  constructor(private readonly dependencies:ExportOrchestratorDependencies){this.naming=dependencies.naming??new FileNamingService();}
  async export(request:ExportRequest,execution:ExportExecutionOptions={}):Promise<ExportResult>{
    const started=Date.now();if(!request.templateId.trim())throw new Error('templateId is required.');if(!request.documentGroupIds.length)throw new Error('Select at least one document.');
    const renderer=this.dependencies.registry.get(request.format);const token=execution.cancellationToken??NEVER_CANCELLED;const files:ExportedFile[]=[];const warnings:ExportWarning[]=[];const usedNames=new Set<string>();let pageCount=0;let dpi:number|undefined;let quality:number|undefined;let backgroundColor:string|undefined;
    for(let index=0;index<request.documentGroupIds.length;index++){
      token.throwIfCancellationRequested();const documentGroupId=request.documentGroupIds[index]!;const percent=Math.floor(index/request.documentGroupIds.length*100);
      execution.onProgress?.({phase:'RESOLVING',currentDocument:index+1,totalDocuments:request.documentGroupIds.length,documentGroupId,pagesGenerated:pageCount,percent});
      const document=await this.dependencies.resolveDocument(request.templateId,documentGroupId);token.throwIfCancellationRequested();
      const values={DocumentGroupKey:document.namingValues?.DocumentGroupKey??documentGroupId,TemplateName:document.template.name,Date:new Date().toISOString().slice(0,10),...document.namingValues};
      const baseName=this.naming.render(request.fileName??request.options?.fileNameTemplate as string|undefined,values,document.template.name);
      execution.onProgress?.({phase:'RENDERING',currentDocument:index+1,totalDocuments:request.documentGroupIds.length,documentGroupId,pagesGenerated:pageCount,percent});
      const rendered=await renderer.render({document,fileName:baseName,options:request.options,cancellationToken:token,onPageProgress:(currentPage,totalPages)=>execution.onProgress?.({phase:'RENDERING',currentDocument:index+1,totalDocuments:request.documentGroupIds.length,documentGroupId,pagesGenerated:pageCount+currentPage,percent:Math.min(99,Math.round(((index+(currentPage/Math.max(1,totalPages)))/request.documentGroupIds.length)*100))})});
      for(const file of rendered.files)files.push({...file,fileName:this.naming.unique(this.naming.sanitize(file.fileName),usedNames)});warnings.push(...rendered.warnings);pageCount+=rendered.pageCount??0;dpi=rendered.diagnostics?.dpi??dpi;quality=rendered.diagnostics?.quality??quality;backgroundColor=rendered.diagnostics?.backgroundColor??backgroundColor;
    }
    token.throwIfCancellationRequested();execution.onProgress?.({phase:'FINALIZING',currentDocument:request.documentGroupIds.length,totalDocuments:request.documentGroupIds.length,pagesGenerated:pageCount,percent:100});
    const durationMs=Date.now()-started;return{format:request.format,files,documentCount:request.documentGroupIds.length,pageCount:pageCount||undefined,warnings,diagnostics:{format:request.format,documentCount:request.documentGroupIds.length,pageCount:pageCount||undefined,durationMs,fileSize:files.reduce((sum,file)=>sum+file.bytes.byteLength,0),warningsCount:warnings.length,rendererVersion:renderer.version,fidelityVersion:this.dependencies.fidelityVersion??'4.16',dpi,quality,backgroundColor}};
  }
}
