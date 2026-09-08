import { describe, expect, it, vi } from 'vitest';
import type { DocumentRenderer, RendererCapabilities, ResolvedExportDocument } from '../src/index.js';
import { ExportCancellationSource, ExportCancelledError, ExportOrchestrator, FileNamingService, RendererRegistry } from '../src/index.js';
import type { TemplateDefinition } from '@document-tool/contracts';

const capabilities:RendererCapabilities={supportsPagination:true,supportsVectorText:true,supportsEditableText:false,supportsTransparency:false,supportsPageNumbers:true,supportsPasswordProtection:false,supportsMixedPageSizes:true};
const template={id:'template-1',name:'Statement',version:1,page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}},header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]}} satisfies TemplateDefinition;
const resolved=(id:string):ResolvedExportDocument=>({documentGroupId:id,template,model:{variables:{formattedAmount:'₹9,588.15'},body:[]},namingValues:{DocumentGroupKey:'INV/001'}});

describe('Phase 4.19.1 export foundation',()=>{
  it('registers and selects renderers without format conditionals',()=>{
    const registry=new RendererRegistry();const renderer={format:'PDF',version:'test',capabilities,render:vi.fn()} as unknown as DocumentRenderer;
    registry.register('PDF',renderer);expect(registry.get('PDF')).toBe(renderer);expect(registry.capabilities('PDF').supportsVectorText).toBe(true);expect(()=>registry.get('PNG')).toThrow(/No renderer/);
  });
  it('resolves lazily, preserves resolved values, diagnoses output, and de-duplicates names',async()=>{
    const registry=new RendererRegistry();const seen:string[]=[];
    registry.register('PDF',{format:'PDF',version:'test-pdf',capabilities,async render(request){seen.push(String(request.document.model.variables.formattedAmount));return{files:[{fileName:`${request.fileName}.pdf`,mimeType:'application/pdf',bytes:new Uint8Array([1,2,3])}],pageCount:1,warnings:[]};}});
    const resolveDocument=vi.fn(async(_templateId:string,id:string)=>resolved(id));
    const result=await new ExportOrchestrator({registry,resolveDocument}).export({format:'PDF',templateId:'template-1',documentGroupIds:['a','b'],fileName:'{DocumentGroupKey}'});
    expect(resolveDocument).toHaveBeenCalledTimes(2);expect(seen).toEqual(['₹9,588.15','₹9,588.15']);expect(result.files.map(file=>file.fileName)).toEqual(['001.pdf','001_2.pdf']);expect(result.diagnostics).toMatchObject({format:'PDF',documentCount:2,pageCount:2,fileSize:6,rendererVersion:'test-pdf',fidelityVersion:'4.16'});
  });
  it('sanitizes traversal and invalid filename characters',()=>{const naming=new FileNamingService();expect(naming.sanitize('../../../secret:report?.pdf')).toBe('secret_report_.pdf');});
  it('cancels safely before resolution/rendering',async()=>{const registry=new RendererRegistry();registry.register('PDF',{format:'PDF',version:'test',capabilities,async render(){throw new Error('must not render');}});const source=new ExportCancellationSource();source.cancel();const resolveDocument=vi.fn(async()=>resolved('a'));await expect(new ExportOrchestrator({registry,resolveDocument}).export({format:'PDF',templateId:'template-1',documentGroupIds:['a']},{cancellationToken:source.token})).rejects.toBeInstanceOf(ExportCancelledError);expect(resolveDocument).not.toHaveBeenCalled();});
});
