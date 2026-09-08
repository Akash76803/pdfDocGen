import type { ArtboardPreset } from '@document-tool/design-engine';
import { VersionedWorkspaceStore, WorkspacePersistenceError, type StringStorage } from './workspace-persistence.js';

export interface CustomArtboardPreset extends ArtboardPreset { category:'CUSTOM'; userDefined:true; createdAt:string; updatedAt:string; }
interface ArtboardPresetWorkspace { presets:CustomArtboardPreset[]; }

export class LocalStorageArtboardPresetRepository {
 private readonly store:VersionedWorkspaceStore<ArtboardPresetWorkspace>;
 private mutations:Promise<void>=Promise.resolve();
 constructor(storage:StringStorage,key='document-tool.card-artboard-presets.v1',appVersion='1.0.0-rc.1'){this.store=new VersionedWorkspaceStore({storage,key,appVersion,validate:isWorkspace});}
 async list():Promise<CustomArtboardPreset[]>{const result=this.store.load();if(result.status==='EMPTY')return[];if(result.status==='RECOVERY_REQUIRED')throw new WorkspacePersistenceError(result.code,result.reason);return structuredClone(result.workspace.presets).sort((a,b)=>a.label.localeCompare(b.label));}
 async save(input:Omit<CustomArtboardPreset,'category'|'userDefined'|'createdAt'|'updatedAt'> & Partial<Pick<CustomArtboardPreset,'createdAt'>>):Promise<CustomArtboardPreset>{const now=new Date().toISOString();const preset:CustomArtboardPreset={...input,category:'CUSTOM',userDefined:true,createdAt:input.createdAt??now,updatedAt:now};validatePreset(preset);await this.mutate(workspace=>{const index=workspace.presets.findIndex(item=>item.id===preset.id);if(index>=0)workspace.presets[index]=structuredClone(preset);else workspace.presets.push(structuredClone(preset));});return structuredClone(preset);}
 async delete(id:string):Promise<void>{await this.mutate(workspace=>{workspace.presets=workspace.presets.filter(item=>item.id!==id);});}
 private async mutate(change:(workspace:ArtboardPresetWorkspace)=>void):Promise<void>{const operation=this.mutations.then(async()=>{const result=this.store.load();if(result.status==='RECOVERY_REQUIRED')throw new WorkspacePersistenceError(result.code,result.reason);const workspace:ArtboardPresetWorkspace=result.status==='EMPTY'?{presets:[]}:structuredClone(result.workspace);change(workspace);await this.store.save(workspace);});this.mutations=operation.catch(()=>{});return operation;}
}

function validatePreset(preset:CustomArtboardPreset):void{if(!preset.id.trim()||!preset.label.trim())throw new Error('Preset name is required.');if(!Number.isFinite(preset.widthMm)||!Number.isFinite(preset.heightMm)||preset.widthMm<=0||preset.heightMm<=0)throw new Error('Preset dimensions must be positive.');}
function isWorkspace(value:unknown):value is ArtboardPresetWorkspace{return isRecord(value)&&Array.isArray(value.presets)&&value.presets.every(isPreset);}
function isPreset(value:unknown):value is CustomArtboardPreset{return isRecord(value)&&typeof value.id==='string'&&typeof value.label==='string'&&value.category==='CUSTOM'&&value.userDefined===true&&typeof value.widthMm==='number'&&value.widthMm>0&&typeof value.heightMm==='number'&&value.heightMm>0&&typeof value.createdAt==='string'&&typeof value.updatedAt==='string';}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
