import type { DesignTemplate } from '@document-tool/contracts';
import { deserializeDesignTemplate, serializeDesignTemplate } from '@document-tool/design-engine';
import type { DesignTemplateRepository, DesignTemplateWorkspace } from './design-template-repository.js';
import { LocalStorageDesignTemplateRepository } from './design-template-repository.js';
import type { UserAssetLibraryItem, UserAssetLibraryRepository, UserAssetLibraryWorkspace } from './asset-library-repository.js';
import { LocalStorageUserAssetLibraryRepository } from './asset-library-repository.js';
import type { StringStorage } from './workspace-persistence.js';

const DB_NAME='document-generator-card-designer-v2';
const DB_VERSION=1;
const WORKSPACE_STORE='workspaces';
const TEMPLATE_KEY='card-design-templates';
const ASSET_KEY='card-user-assets';

function hasIndexedDb():boolean{return typeof indexedDB!=='undefined';}
function requestToPromise<T>(request:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error??new Error('IndexedDB request failed.'));});}
function transactionDone(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??new Error('IndexedDB transaction failed.'));tx.onabort=()=>reject(tx.error??new Error('IndexedDB transaction aborted.'));});}
async function openDb():Promise<IDBDatabase>{
  const request=indexedDB.open(DB_NAME,DB_VERSION);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(WORKSPACE_STORE))db.createObjectStore(WORKSPACE_STORE);};
  return requestToPromise(request);
}
async function idbGet<T>(key:string):Promise<T|undefined>{const db=await openDb();try{const tx=db.transaction(WORKSPACE_STORE,'readonly');const done=transactionDone(tx);const value=await requestToPromise(tx.objectStore(WORKSPACE_STORE).get(key));await done;return value as T|undefined;}finally{db.close();}}
async function idbSet<T>(key:string,value:T):Promise<void>{const db=await openDb();try{const tx=db.transaction(WORKSPACE_STORE,'readwrite');const done=transactionDone(tx);tx.objectStore(WORKSPACE_STORE).put(value,key);await done;}finally{db.close();}}

function cloneTemplate(template:DesignTemplate):DesignTemplate{return deserializeDesignTemplate(serializeDesignTemplate(template));}
function quotaSafeMessage(error:unknown):Error{
  if(error instanceof DOMException&&(error.name==='QuotaExceededError'||error.name==='UnknownError'))return new Error('Workspace storage is full. The current canvas remains editable; export or remove unused assets before saving again.');
  return error instanceof Error?error:new Error('Workspace could not be saved.');
}

export class IndexedDbDesignTemplateRepository implements DesignTemplateRepository{
  private mutations:Promise<void>=Promise.resolve();
  private migrationAttempted=false;
  private readonly legacy:LocalStorageDesignTemplateRepository;
  constructor(private readonly storage:StringStorage){this.legacy=new LocalStorageDesignTemplateRepository(storage);}
  private async ensureMigrated():Promise<void>{
    if(this.migrationAttempted||!hasIndexedDb())return;this.migrationAttempted=true;
    const existing=await idbGet<DesignTemplateWorkspace>(TEMPLATE_KEY);if(existing)return;
    try{const templates=await this.legacy.list();const activeTemplateId=await this.legacy.getActiveId()??undefined;if(templates.length||activeTemplateId){await idbSet(TEMPLATE_KEY,{templates,activeTemplateId});try{this.storage.removeItem?.('document-tool.card-design-templates.v1.last-good');}catch{}}}catch{/* Preserve legacy data and start clean in IndexedDB if legacy is corrupt/full. */}
  }
  private async read():Promise<DesignTemplateWorkspace>{
    if(!hasIndexedDb()){const templates=await this.legacy.list();return{templates,activeTemplateId:await this.legacy.getActiveId()??undefined};}
    await this.ensureMigrated();return(await idbGet<DesignTemplateWorkspace>(TEMPLATE_KEY))??{templates:[]};
  }
  async list(){const w=await this.read();return w.templates.map(cloneTemplate);}
  async getById(id:string){return(await this.list()).find(t=>t.id===id)??null;}
  async save(template:DesignTemplate){if(!hasIndexedDb())return this.legacy.save(template);const validated=cloneTemplate(template);return this.mutate(w=>{const i=w.templates.findIndex(t=>t.id===validated.id);if(i>=0)w.templates[i]=validated;else w.templates.push(validated);w.activeTemplateId=validated.id;});}
  async delete(id:string){if(!hasIndexedDb())return this.legacy.delete(id);return this.mutate(w=>{w.templates=w.templates.filter(t=>t.id!==id);if(w.activeTemplateId===id)w.activeTemplateId=w.templates[0]?.id;});}
  async getActiveId(){return(await this.read()).activeTemplateId??null;}
  async setActiveId(id:string|null){if(!hasIndexedDb())return this.legacy.setActiveId(id);return this.mutate(w=>{w.activeTemplateId=id??undefined;});}
  private async mutate(change:(workspace:DesignTemplateWorkspace)=>void){const op=this.mutations.then(async()=>{const w=structuredClone(await this.read());change(w);try{await idbSet(TEMPLATE_KEY,w);}catch(error){throw quotaSafeMessage(error);}});this.mutations=op.catch(()=>{});return op;}
}

export class IndexedDbUserAssetLibraryRepository implements UserAssetLibraryRepository{
  private mutations:Promise<void>=Promise.resolve();
  private migrationAttempted=false;
  private readonly legacy:LocalStorageUserAssetLibraryRepository;
  constructor(private readonly storage:StringStorage){this.legacy=new LocalStorageUserAssetLibraryRepository(storage);}
  private async ensureMigrated():Promise<void>{if(this.migrationAttempted||!hasIndexedDb())return;this.migrationAttempted=true;const existing=await idbGet<UserAssetLibraryWorkspace>(ASSET_KEY);if(existing)return;try{const assets=await this.legacy.list();if(assets.length){await idbSet(ASSET_KEY,{assets});try{this.storage.removeItem?.('document-tool.card-user-assets.v1.last-good');}catch{}}}catch{/* keep legacy untouched */}}
  private async read():Promise<UserAssetLibraryWorkspace>{if(!hasIndexedDb())return{assets:await this.legacy.list()};await this.ensureMigrated();return(await idbGet<UserAssetLibraryWorkspace>(ASSET_KEY))??{assets:[]};}
  async list(){return structuredClone((await this.read()).assets).sort((a,b)=>String(b.metadata.createdAt).localeCompare(String(a.metadata.createdAt)));}
  async save(asset:UserAssetLibraryItem){if(!hasIndexedDb())return this.legacy.save(asset);return this.mutate(w=>{const i=w.assets.findIndex(x=>x.id===asset.id);if(i>=0)w.assets[i]=structuredClone(asset);else w.assets.push(structuredClone(asset));});}
  async rename(id:string,name:string){if(!hasIndexedDb())return this.legacy.rename(id,name);const clean=name.trim();if(!clean)throw new Error('Asset name cannot be empty.');return this.mutate(w=>{const item=w.assets.find(x=>x.id===id);if(!item)throw new Error('Asset not found.');item.name=clean;item.metadata={...item.metadata,updatedAt:new Date().toISOString()};});}
  async delete(id:string){if(!hasIndexedDb())return this.legacy.delete(id);return this.mutate(w=>{w.assets=w.assets.filter(x=>x.id!==id);});}
  private async mutate(change:(workspace:UserAssetLibraryWorkspace)=>void){const op=this.mutations.then(async()=>{const w=structuredClone(await this.read());change(w);try{await idbSet(ASSET_KEY,w);}catch(error){throw quotaSafeMessage(error);}});this.mutations=op.catch(()=>{});return op;}
}
