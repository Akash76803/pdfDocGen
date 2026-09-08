export const CURRENT_WORKSPACE_SCHEMA_VERSION=1;
export const WORKSPACE_BACKUP_FORMAT='DOCUMENT_GENERATOR_WORKSPACE' as const;

export interface PersistedWorkspaceEnvelope<T>{schemaVersion:number;appVersion:string;savedAt:string;revision:number;workspace:T;}
export interface WorkspaceBackup<T> extends PersistedWorkspaceEnvelope<T>{format:typeof WORKSPACE_BACKUP_FORMAT;exportedAt:string;}
export interface WorkspaceMigration{fromVersion:number;toVersion:number;migrate(data:unknown):unknown;}
export type WorkspaceLoadResult<T>=|{status:'EMPTY'}|{status:'LOADED';workspace:T;envelope:PersistedWorkspaceEnvelope<T>;migrated:boolean}|{status:'RECOVERY_REQUIRED';reason:string;code:PersistenceErrorCode;rawBackupAvailable:boolean};
export type PersistenceErrorCode='PERSISTENCE_READ_FAILED'|'PERSISTENCE_WRITE_FAILED'|'WORKSPACE_CORRUPT'|'WORKSPACE_VERSION_TOO_NEW'|'MIGRATION_FAILED'|'BACKUP_INVALID'|'BACKUP_IMPORT_FAILED';
export class WorkspacePersistenceError extends Error{constructor(readonly code:PersistenceErrorCode,message:string,options?:{cause?:unknown}){super(message,options);this.name='WorkspacePersistenceError';}}
export interface StringStorage{getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem?(key:string):void;}

export interface WorkspacePersistenceOptions<T>{storage:StringStorage;key:string;appVersion:string;validate(value:unknown):value is T;migrations?:WorkspaceMigration[];legacyMigration?(value:unknown):unknown;now?:()=>Date;}

export class VersionedWorkspaceStore<T>{
  private revision=0;private queue:Promise<void>=Promise.resolve();
  constructor(private readonly options:WorkspacePersistenceOptions<T>){}
  load():WorkspaceLoadResult<T>{
    let raw:string|null;try{raw=this.options.storage.getItem(this.options.key);}catch{return{status:'RECOVERY_REQUIRED',reason:'Workspace storage could not be read.',code:'PERSISTENCE_READ_FAILED',rawBackupAvailable:false};}
    if(raw===null)return{status:'EMPTY'};
    try{const parsed=JSON.parse(raw) as unknown;const migrated=this.migrate(parsed);this.revision=Math.max(this.revision,migrated.envelope.revision);return{status:'LOADED',workspace:migrated.envelope.workspace,envelope:migrated.envelope,migrated:migrated.migrated};}
    catch(error){const known=error instanceof WorkspacePersistenceError?error:new WorkspacePersistenceError('WORKSPACE_CORRUPT','Saved workspace is invalid.',{cause:error});return{status:'RECOVERY_REQUIRED',reason:known.message,code:known.code,rawBackupAvailable:true};}
  }
  async save(workspace:T):Promise<PersistedWorkspaceEnvelope<T>>{
    if(!this.options.validate(workspace))throw new WorkspacePersistenceError('PERSISTENCE_WRITE_FAILED','Workspace validation failed before save.');
    const revision=++this.revision;const envelope=this.envelope(workspace,revision);const serialized=JSON.stringify(envelope);JSON.parse(serialized);
    const operation=this.queue.then(()=>{try{this.options.storage.setItem(`${this.options.key}.last-good`,this.options.storage.getItem(this.options.key)??serialized);this.options.storage.setItem(this.options.key,serialized);}catch(error){throw new WorkspacePersistenceError('PERSISTENCE_WRITE_FAILED',quotaMessage(error),{cause:error});}});this.queue=operation.catch(()=>{});await operation;return envelope;
  }
  exportBackup(workspace:T):WorkspaceBackup<T>{if(!this.options.validate(workspace))throw new WorkspacePersistenceError('BACKUP_INVALID','Workspace cannot be backed up because it is invalid.');const envelope=this.envelope(workspace,this.revision);return{...envelope,format:WORKSPACE_BACKUP_FORMAT,exportedAt:this.now()};}
  parseBackup(raw:string):PersistedWorkspaceEnvelope<T>{let parsed:unknown;try{parsed=JSON.parse(raw);}catch(error){throw new WorkspacePersistenceError('BACKUP_INVALID','This is not a valid Document Generator workspace backup.',{cause:error});}if(!isRecord(parsed)||parsed.format!==WORKSPACE_BACKUP_FORMAT)throw new WorkspacePersistenceError('BACKUP_INVALID','This is not a valid Document Generator workspace backup.');return this.migrate(parsed).envelope;}
  async importBackup(raw:string):Promise<T>{const incoming=this.parseBackup(raw);await this.save(incoming.workspace);return incoming.workspace;}
  recoveryCopy():string|null{try{return this.options.storage.getItem(this.options.key);}catch{return null;}}
  reset():void{this.options.storage.removeItem?.(this.options.key);this.revision=0;}
  private migrate(value:unknown):{envelope:PersistedWorkspaceEnvelope<T>;migrated:boolean}{
    let version=0;let data:unknown=value;let migrated=false;
    if(isRecord(value)&&typeof value.schemaVersion==='number'){version=value.schemaVersion;if(version>CURRENT_WORKSPACE_SCHEMA_VERSION)throw new WorkspacePersistenceError('WORKSPACE_VERSION_TOO_NEW','This workspace was created with a newer version of Document Generator. Please update the application before opening it.');data=value.workspace;this.revision=typeof value.revision==='number'?value.revision:0;}
    else data=this.options.legacyMigration?.(value)??value;
    const migrations=[...(this.options.migrations??[])].sort((a,b)=>a.fromVersion-b.fromVersion);
    while(version<CURRENT_WORKSPACE_SCHEMA_VERSION){const step=migrations.find(item=>item.fromVersion===version);if(!step){if(version===0){version=1;migrated=true;break;}throw new WorkspacePersistenceError('MIGRATION_FAILED',`No workspace migration exists for schema ${version}.`);}try{data=step.migrate(data);version=step.toVersion;migrated=true;}catch(error){throw new WorkspacePersistenceError('MIGRATION_FAILED',`Workspace migration ${step.fromVersion} to ${step.toVersion} failed.`,{cause:error});}}
    if(!this.options.validate(data))throw new WorkspacePersistenceError('WORKSPACE_CORRUPT','Saved workspace has missing or invalid fields.');
    return{envelope:this.envelope(data,this.revision),migrated};
  }
  private envelope(workspace:T,revision:number):PersistedWorkspaceEnvelope<T>{return{schemaVersion:CURRENT_WORKSPACE_SCHEMA_VERSION,appVersion:this.options.appVersion,savedAt:this.now(),revision,workspace};}
  private now(){return(this.options.now?.()??new Date()).toISOString();}
}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
function quotaMessage(error:unknown){return error instanceof DOMException&&error.name==='QuotaExceededError'?'Workspace could not be saved because local storage is full.':'Workspace could not be saved.';}
