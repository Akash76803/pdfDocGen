import { describe, expect, it } from 'vitest';
import type { TemplateDefinition } from '@document-tool/contracts';
import { ExportOrchestrator, RendererRegistry } from '@document-tool/renderer-sdk';
import { PdfExportRenderer } from '../src/index.js';

describe('Phase 4.19.1 PDF orchestrator adapter',()=>{
  it('routes an existing resolved RenderModel through Engine PDF',async()=>{
    const template={id:'foundation',name:'Foundation',version:1,page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}},header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]}} satisfies TemplateDefinition;
    const registry=new RendererRegistry();registry.register('PDF',new PdfExportRenderer());
    const result=await new ExportOrchestrator({registry,resolveDocument:async(_templateId,documentGroupId)=>({documentGroupId,template,model:{variables:{},page:template.page,body:[{id:'text',type:'TEXT',text:'FOUNDATION PDF',style:{fontFamily:'Arial',fontSize:12,bold:false,italic:false,underline:false,textColor:'#000000',backgroundColor:'transparent',alignment:'LEFT',lineHeight:1.2},layout:{widthPercent:100,alignment:'LEFT',marginTop:0,marginRight:0,marginBottom:0,marginLeft:0,keepTogether:false,breakBefore:false,breakAfter:false}}]}})}).export({format:'PDF',templateId:template.id,documentGroupIds:['group-1'],fileName:'Foundation'});
    const pdf=new TextDecoder('latin1').decode(result.files[0]!.bytes);expect(pdf.startsWith('%PDF-')).toBe(true);expect(pdf).toContain('FOUNDATION PDF');expect(result).toMatchObject({format:'PDF',documentCount:1,pageCount:1});
  });
});
