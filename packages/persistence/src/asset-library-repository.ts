import type { AssetReference } from '@document-tool/contracts';
import { VersionedWorkspaceStore, WorkspacePersistenceError, type StringStorage } from './workspace-persistence.js';

export interface UserAssetLibraryItem extends AssetReference {
  id:string;
  name:string;
  metadata:Record<string,unknown> & {
    userLibrary:true;
    createdAt:string;
    updatedAt:string;
  };
}

export interface UserAssetLibraryWorkspace { assets:UserAssetLibraryItem[]; }

export interface UserAssetLibraryRepository {
  list():Promise<UserAssetLibraryItem[]>;
  save(asset:UserAssetLibraryItem):Promise<void>;
  rename(id:string,name:string):Promise<void>;
  delete(id:string):Promise<void>;
}

export class LocalStorageUserAssetLibraryRepository implements UserAssetLibraryRepository {
  private readonly store:VersionedWorkspaceStore<UserAssetLibraryWorkspace>;
  private mutations:Promise<void>=Promise.resolve();
  constructor(storage:StringStorage,key='document-tool.card-user-assets.v1',appVersion='1.0.0-rc.1'){
    this.store=new VersionedWorkspaceStore({storage,key,appVersion,validate:isWorkspace});
  }
  async list(){const r=this.store.load();if(r.status==='EMPTY')return[];if(r.status==='RECOVERY_REQUIRED')throw new WorkspacePersistenceError(r.code,r.reason);return structuredClone(r.workspace.assets).sort((a,b)=>String(b.metadata.createdAt).localeCompare(String(a.metadata.createdAt)));}
  async save(asset:UserAssetLibraryItem){return this.mutate(w=>{const i=w.assets.findIndex(x=>x.id===asset.id);if(i>=0)w.assets[i]=structuredClone(asset);else w.assets.push(structuredClone(asset));});}
  async rename(id:string,name:string){const clean=name.trim();if(!clean)throw new Error('Asset name cannot be empty.');return this.mutate(w=>{const item=w.assets.find(x=>x.id===id);if(!item)throw new Error('Asset not found.');item.name=clean;item.metadata={...item.metadata,updatedAt:new Date().toISOString()};});}
  async delete(id:string){return this.mutate(w=>{w.assets=w.assets.filter(x=>x.id!==id);});}
  private async mutate(change:(w:UserAssetLibraryWorkspace)=>void){const op=this.mutations.then(async()=>{const r=this.store.load();if(r.status==='RECOVERY_REQUIRED')throw new WorkspacePersistenceError(r.code,r.reason);const w:UserAssetLibraryWorkspace=r.status==='EMPTY'?{assets:[]}:structuredClone(r.workspace);change(w);await this.store.save(w);});this.mutations=op.catch(()=>{});return op;}
}

function isWorkspace(value:unknown):value is UserAssetLibraryWorkspace{
  if(!isRecord(value)||!Array.isArray(value.assets))return false;
  return value.assets.every(isAsset);
}
function isAsset(value:unknown):value is UserAssetLibraryItem{
  if(!isRecord(value)||typeof value.id!=='string'||typeof value.name!=='string'||typeof value.kind!=='string'||typeof value.sourceType!=='string'||typeof value.source!=='string')return false;
  if(!isRecord(value.metadata)||value.metadata.userLibrary!==true||typeof value.metadata.createdAt!=='string'||typeof value.metadata.updatedAt!=='string')return false;
  return true;
}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
