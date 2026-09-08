import type { DocumentGroup,TemplateDefinition,TemplateRenderResult,TemplateValidationResult } from '@document-tool/contracts';
import type { TemplateRepository } from '@document-tool/persistence';
import { TemplateEngine,discoverFieldPaths } from '@document-tool/template-engine';
export class TemplateApplicationService {
  constructor(private readonly repository:TemplateRepository,private readonly engine=new TemplateEngine()){}
  createBlank(name='Untitled Template'):TemplateDefinition {const now=new Date().toISOString();return{id:makeId('template'),name,version:1,page:{size:'A4',orientation:'PORTRAIT',margins:{top:15,right:15,bottom:15,left:15}},header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]},metadata:{createdAt:now,updatedAt:now}};}
  validate(template:TemplateDefinition):TemplateValidationResult{return this.engine.validate(template);}
  buildPreview(template:TemplateDefinition,group:DocumentGroup):TemplateRenderResult{return this.engine.buildRenderModel(template,group);}
  discoverFields(group:DocumentGroup){return discoverFieldPaths(group);}
  async save(template:TemplateDefinition){await this.repository.save({...template,metadata:{...template.metadata,updatedAt:new Date().toISOString()}});}
  list(){return this.repository.list();} getById(id:string){return this.repository.getById(id);} delete(id:string){return this.repository.delete(id);}
}
export function makeId(prefix='id'):string{return typeof crypto!=='undefined'&&'randomUUID'in crypto?`${prefix}-${crypto.randomUUID()}`:`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;}
