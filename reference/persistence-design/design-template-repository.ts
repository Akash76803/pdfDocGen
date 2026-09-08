import type { DesignTemplate } from '@document-tool/contracts';
import { deserializeDesignTemplate, serializeDesignTemplate } from '@document-tool/design-engine';
import { VersionedWorkspaceStore, WorkspacePersistenceError, type StringStorage, type WorkspaceBackup, type WorkspaceLoadResult } from './workspace-persistence.js';
export interface DesignTemplateWorkspace{templates:DesignTemplate[];activeTemplateId?:string;}
export interface DesignTemplateRepository{getById(id:string):Promise<DesignTemplate|null>;list():Promise<DesignTemplate[]>;save(template:DesignTemplate):Promise<void>;delete(id:string):Promise<void>;getActiveId():Promise<string|null>;setActiveId(id:string|null):Promise<void>;}
export class LocalStorageDesignTemplateRepository implements DesignTemplateRepository{
private readonly store:VersionedWorkspaceStore<DesignTemplateWorkspace>;private mutations:Promise<void>=Promise.resolve();
constructor(storage:StringStorage,key='document-tool.card-design-templates.v1',appVersion='1.0.0-rc.1'){this.store=new VersionedWorkspaceStore({storage,key,appVersion,validate:isWorkspace});}
inspect():WorkspaceLoadResult<DesignTemplateWorkspace>{return this.store.load();}
async list(){const result=this.store.load();if(result.status==='EMPTY')return[];if(result.status==='RECOVERY_REQUIRED')throw new WorkspacePersistenceError(result.code,result.reason);return result.workspace.templates.map(t=>deserializeDesignTemplate(serializeDesignTemplate(t)));}
async getById(id:string){return(await this.list()).find(t=>t.id===id)??null;}
async save(template:DesignTemplate){const validated=deserializeDesignTemplate(serializeDesignTemplate(template));return this.mutate(w=>{const i=w.templates.findIndex(t=>t.id===validated.id);if(i>=0)w.templates[i]=validated;else w.templates.push(validated);w.activeTemplateId=validated.id;});}
async delete(id:string){return this.mutate(w=>{w.templates=w.templates.filter(t=>t.id!==id);if(w.activeTemplateId===id)w.activeTemplateId=w.templates[0]?.id;});}
async getActiveId(){const r=this.store.load();if(r.status==='EMPTY')return null;if(r.status==='RECOVERY_REQUIRED')throw new WorkspacePersistenceError(r.code,r.reason);return r.workspace.activeTemplateId??null;}
async setActiveId(id:string|null){return this.mutate(w=>{w.activeTemplateId=id??undefined;});}
exportBackup():WorkspaceBackup<DesignTemplateWorkspace>{const r=this.store.load();if(r.status==='RECOVERY_REQUIRED')throw new WorkspacePersistenceError(r.code,r.reason);return this.store.exportBackup(r.status==='EMPTY'?{templates:[]}:r.workspace);}
async importBackup(raw:string){return this.store.importBackup(raw);} recoveryCopy(){return this.store.recoveryCopy();} reset(){this.store.reset();}
private async mutate(change:(w:DesignTemplateWorkspace)=>void){const op=this.mutations.then(async()=>{const r=this.store.load();if(r.status==='RECOVERY_REQUIRED')throw new WorkspacePersistenceError(r.code,r.reason);const w:DesignTemplateWorkspace=r.status==='EMPTY'?{templates:[]}:structuredClone(r.workspace);change(w);await this.store.save(w);});this.mutations=op.catch(()=>{});return op;}}
function isWorkspace(value:unknown):value is DesignTemplateWorkspace{if(!isRecord(value)||!Array.isArray(value.templates))return false;try{for(const t of value.templates)deserializeDesignTemplate(JSON.stringify(t));return value.activeTemplateId===undefined||typeof value.activeTemplateId==='string';}catch{return false;}}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
