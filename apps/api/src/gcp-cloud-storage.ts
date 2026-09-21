import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import type { GcpStorageConfig } from './cloud-storage-config.js';
import {
  PersistentCloudTemplateRepository,
  type CloudObjectStore,
  type CloudTemplateMetadataStore,
  type CloudTemplateVersionMetadata,
} from './cloud-template-repository.js';

function conflict(message:string, details:Record<string,unknown>) {
  return Object.assign(new Error(message),{code:'TEMPLATE_VERSION_CONFLICT',details});
}

export class GcsObjectStore implements CloudObjectStore {
  constructor(private readonly storage:Storage, private readonly bucketName:string) {}
  async putImmutable(path:string, bytes:Uint8Array, contentType:string, sha256:string):Promise<void> {
    const file=this.storage.bucket(this.bucketName).file(path);
    try {
      await file.save(Buffer.from(bytes),{resumable:false,contentType,preconditionOpts:{ifGenerationMatch:0},metadata:{metadata:{sha256}}});
    } catch (error) {
      const code=typeof error==='object'&&error&&'code'in error?Number((error as {code:unknown}).code):0;
      if (code!==412) throw error;
      const [metadata]=await file.getMetadata();
      if (metadata.metadata?.sha256!==sha256) throw conflict('Immutable cloud object already exists with different content.',{objectPath:path});
    }
  }
  async get(path:string):Promise<Uint8Array> { const [bytes]=await this.storage.bucket(this.bucketName).file(path).download(); return bytes; }
}

export class FirestoreTemplateMetadataStore implements CloudTemplateMetadataStore {
  constructor(private readonly firestore:Firestore) {}
  private current(templateId:string) { return this.firestore.collection('documentBuilderTemplates').doc(templateId); }
  private version(templateId:string,version:number) { return this.current(templateId).collection('versions').doc(String(version)); }
  async getCurrent(templateId:string):Promise<CloudTemplateVersionMetadata|null> { const value=await this.current(templateId).get(); return value.exists ? value.data() as CloudTemplateVersionMetadata : null; }
  async getVersion(templateId:string,version:number):Promise<CloudTemplateVersionMetadata|null> { const value=await this.version(templateId,version).get(); return value.exists ? value.data() as CloudTemplateVersionMetadata : null; }
  async commitVersion(record:CloudTemplateVersionMetadata,expectedVersion:number|undefined):Promise<'published'|'updated'> {
    return await this.firestore.runTransaction(async transaction=>{
      const currentRef=this.current(record.templateId); const versionRef=this.version(record.templateId,record.version);
      const [currentSnapshot,versionSnapshot]=await Promise.all([transaction.get(currentRef),transaction.get(versionRef)]);
      const current=currentSnapshot.exists ? currentSnapshot.data() as CloudTemplateVersionMetadata : null;
      if (versionSnapshot.exists) throw conflict(`Template version ${record.version} already exists.`,{templateId:record.templateId,currentVersion:current?.version??record.version});
      if (current) {
        if (expectedVersion===undefined||expectedVersion!==current.version) throw conflict(`Template version conflict. Current cloud version is ${current.version}.`,{templateId:record.templateId,expectedVersion,currentVersion:current.version});
        if (record.version!==current.version+1) throw Object.assign(new Error(`Updated template version must be ${current.version+1}.`),{code:'INVALID_TEMPLATE_VERSION',details:{templateId:record.templateId,requestedVersion:record.version,requiredVersion:current.version+1}});
      } else if (expectedVersion!==undefined&&expectedVersion!==0) throw conflict('Template does not exist in the publish repository.',{templateId:record.templateId,expectedVersion,currentVersion:null});
      transaction.create(versionRef,record); transaction.set(currentRef,record);
      return current?'updated':'published';
    });
  }
  async deleteCurrent(templateId:string):Promise<void> { await this.current(templateId).delete(); }
}

export function createGcpCloudTemplateRepository(config:GcpStorageConfig):PersistentCloudTemplateRepository {
  const firestore=new Firestore({...(config.projectId?{projectId:config.projectId}:{}),databaseId:config.firestoreDatabaseId});
  const storage=new Storage(config.projectId?{projectId:config.projectId}:{});
  return new PersistentCloudTemplateRepository(new FirestoreTemplateMetadataStore(firestore),new GcsObjectStore(storage,config.templateBucket),config.templatePrefix,config.assetPrefix);
}
