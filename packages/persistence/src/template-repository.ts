import type { TemplateDefinition } from '@document-tool/contracts';
import { VersionedWorkspaceStore, WorkspacePersistenceError, type StringStorage, type WorkspaceBackup, type WorkspaceLoadResult } from './workspace-persistence.js';

export interface TemplateWorkspace{templates:TemplateDefinition[];}
export interface TemplateRepository { getById(id:string):Promise<TemplateDefinition|null>;list():Promise<TemplateDefinition[]>;save(template:TemplateDefinition):Promise<void>;delete(id:string):Promise<void>; }
export type KeyValueStorage=StringStorage;
export class InMemoryTemplateRepository implements TemplateRepository {
  private templates=new Map<string,TemplateDefinition>();
  constructor(seed:TemplateDefinition[]=[]){for(const template of seed)this.templates.set(template.id,template);}
  async getById(id:string){return this.templates.get(id)??null;} async list(){return [...this.templates.values()];} async save(template:TemplateDefinition){this.templates.set(template.id,template);} async delete(id:string){this.templates.delete(id);}
}
export class LocalStorageTemplateRepository implements TemplateRepository {
  private readonly store:VersionedWorkspaceStore<TemplateWorkspace>;private mutations:Promise<void>=Promise.resolve();
  constructor(storage:KeyValueStorage,key='document-tool.templates.v1',appVersion='1.0.0-rc.1'){
    this.store=new VersionedWorkspaceStore({storage,key,appVersion,validate:isTemplateWorkspace,legacyMigration:value=>Array.isArray(value)?{templates:value}:value});
  }
  inspect():WorkspaceLoadResult<TemplateWorkspace>{return this.store.load();}
  async getById(id:string){return(await this.list()).find(template=>template.id===id)??null;}
  async list(){const result=this.store.load();if(result.status==='EMPTY')return[];if(result.status==='RECOVERY_REQUIRED')throw new WorkspacePersistenceError(result.code,result.reason);if(result.migrated)await this.store.save(result.workspace);return result.workspace.templates;}
  async save(template:TemplateDefinition){return this.mutate(templates=>{const index=templates.findIndex(item=>item.id===template.id);if(index>=0)templates[index]=template;else templates.push(template);});}
  async delete(id:string){return this.mutate(templates=>{const index=templates.findIndex(template=>template.id===id);if(index>=0)templates.splice(index,1);});}
  exportBackup():WorkspaceBackup<TemplateWorkspace>{const result=this.store.load();if(result.status==='RECOVERY_REQUIRED')throw new WorkspacePersistenceError(result.code,result.reason);return this.store.exportBackup(result.status==='EMPTY'?{templates:[]}:result.workspace);}
  async importBackup(raw:string){return this.store.importBackup(raw);}
  recoveryCopy(){return this.store.recoveryCopy();}
  reset(){this.store.reset();}
  private async mutate(change:(templates:TemplateDefinition[])=>void){const operation=this.mutations.then(async()=>{const current=await this.list();const templates=current.map(template=>structuredClone(template));change(templates);await this.store.save({templates});});this.mutations=operation.catch(()=>{});return operation;}
}
function isTemplateWorkspace(value:unknown):value is TemplateWorkspace{return isRecord(value)&&Array.isArray(value.templates)&&value.templates.every(isTemplate);}
function isTemplate(value:unknown):value is TemplateDefinition{return isRecord(value)&&typeof value.id==='string'&&!!value.id&&typeof value.name==='string'&&typeof value.version==='number'&&isRecord(value.page)&&isRegion(value.header)&&isRegion(value.body)&&isRegion(value.footer);}
function isRegion(value:unknown){return isRecord(value)&&Array.isArray(value.blocks);}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
