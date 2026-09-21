import { createHash } from 'node:crypto';
import {
  TEMPLATE_PUBLICATION_FORMAT,
  type PublishTemplateRequest,
  type PublishTemplateResponse,
  type TemplateDefinition,
  type TemplatePublicationMetadata,
  type TemplatePublicationStatus,
} from '@document-tool/contracts';
import type { TemplateRepository } from '@document-tool/generation-core';
import { adaptDesktopTemplateEntry, isDesktopTemplateEntry } from './desktop-template-adapter.js';

const SAFE_TEMPLATE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CLOUD_ASSET_SCHEME = 'cloud-asset://';

export type CloudAssetReference = { sha256:string; objectPath:string; contentType:string; sizeBytes:number };
export type CloudTemplateVersionMetadata = {
  format: typeof TEMPLATE_PUBLICATION_FORMAT;
  templateId: string;
  name: string;
  version: number;
  status: TemplatePublicationStatus;
  metadata: TemplatePublicationMetadata;
  publishedAt: string;
  updatedAt: string;
  templateObjectPath: string;
  templateSha256: string;
  assets: CloudAssetReference[];
};

export interface CloudObjectStore {
  putImmutable(path:string, bytes:Uint8Array, contentType:string, sha256:string):Promise<void>;
  get(path:string):Promise<Uint8Array>;
}

export interface CloudTemplateMetadataStore {
  getCurrent(templateId:string):Promise<CloudTemplateVersionMetadata|null>;
  getVersion(templateId:string, version:number):Promise<CloudTemplateVersionMetadata|null>;
  commitVersion(record:CloudTemplateVersionMetadata, expectedVersion:number|undefined):Promise<'published'|'updated'>;
  deleteCurrent(templateId:string):Promise<void>;
}

function sha256(bytes:Uint8Array):string { return createHash('sha256').update(bytes).digest('hex'); }

function parseDataUrl(value:string):{contentType:string;bytes:Uint8Array}|null {
  const match=/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
  if (!match) return null;
  return { contentType:match[1]!, bytes:Buffer.from(match[2]!.replace(/\s/g,''),'base64') };
}

function extensionFor(contentType:string):string {
  return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg'} as Record<string,string>)[contentType] ?? 'bin';
}

async function externalizeAssets(value:unknown, objects:CloudObjectStore, assetPrefix:string, manifest:Map<string,CloudAssetReference>):Promise<unknown> {
  if (typeof value === 'string') {
    const parsed=parseDataUrl(value);
    if (!parsed) return value;
    const digest=sha256(parsed.bytes);
    const existing=manifest.get(digest);
    if (existing) return `${CLOUD_ASSET_SCHEME}${digest}`;
    const objectPath=`${assetPrefix}/${digest}.${extensionFor(parsed.contentType)}`;
    await objects.putImmutable(objectPath,parsed.bytes,parsed.contentType,digest);
    manifest.set(digest,{sha256:digest,objectPath,contentType:parsed.contentType,sizeBytes:parsed.bytes.byteLength});
    return `${CLOUD_ASSET_SCHEME}${digest}`;
  }
  if (Array.isArray(value)) return await Promise.all(value.map(item=>externalizeAssets(item,objects,assetPrefix,manifest)));
  if (value && typeof value === 'object') {
    const result:Record<string,unknown>={};
    for (const [key,item] of Object.entries(value as Record<string,unknown>)) result[key]=await externalizeAssets(item,objects,assetPrefix,manifest);
    return result;
  }
  return value;
}

async function hydrateAssets(value:unknown, objects:CloudObjectStore, assets:Map<string,CloudAssetReference>):Promise<unknown> {
  if (typeof value === 'string' && value.startsWith(CLOUD_ASSET_SCHEME)) {
    const asset=assets.get(value.slice(CLOUD_ASSET_SCHEME.length));
    if (!asset) throw Object.assign(new Error('Published template references a missing cloud asset.'),{code:'CLOUD_ASSET_NOT_FOUND'});
    const bytes=await objects.get(asset.objectPath);
    if (sha256(bytes)!==asset.sha256) throw Object.assign(new Error('Cloud asset integrity verification failed.'),{code:'CLOUD_ASSET_INTEGRITY_FAILED'});
    return `data:${asset.contentType};base64,${Buffer.from(bytes).toString('base64')}`;
  }
  if (Array.isArray(value)) return await Promise.all(value.map(item=>hydrateAssets(item,objects,assets)));
  if (value && typeof value === 'object') {
    const result:Record<string,unknown>={};
    for (const [key,item] of Object.entries(value as Record<string,unknown>)) result[key]=await hydrateAssets(item,objects,assets);
    return result;
  }
  return value;
}

export class PersistentCloudTemplateRepository implements TemplateRepository {
  constructor(
    private readonly metadataStore:CloudTemplateMetadataStore,
    private readonly objectStore:CloudObjectStore,
    private readonly templatePrefix:string,
    private readonly assetPrefix:string,
  ) {}

  async saveDesktopTemplateEntry():Promise<string> {
    throw Object.assign(new Error('Cloud templates must use the version-safe publish endpoint.'),{code:'CLOUD_PUBLISH_REQUIRED'});
  }

  async publishTemplate(request:PublishTemplateRequest):Promise<PublishTemplateResponse> {
    if (!SAFE_TEMPLATE_ID.test(request.templateId) || request.templateId.includes('..')) throw Object.assign(new Error('Template ID is invalid.'),{code:'INVALID_TEMPLATE_ID'});
    if (!isDesktopTemplateEntry(request.template) || request.template.id!==request.templateId) throw Object.assign(new Error('Published template content must be a valid matching desktop template entry.'),{code:'INVALID_TEMPLATE_PAYLOAD'});
    const current=await this.metadataStore.getCurrent(request.templateId);
    if (current) {
      if (request.expectedVersion===undefined || request.expectedVersion!==current.version) {
        throw Object.assign(new Error(`Template version conflict. Current cloud version is ${current.version}.`),{code:'TEMPLATE_VERSION_CONFLICT',details:{templateId:request.templateId,expectedVersion:request.expectedVersion,currentVersion:current.version}});
      }
      if (request.version!==current.version+1) {
        throw Object.assign(new Error(`Updated template version must be ${current.version+1}.`),{code:'INVALID_TEMPLATE_VERSION',details:{templateId:request.templateId,requestedVersion:request.version,requiredVersion:current.version+1}});
      }
    } else if (request.expectedVersion!==undefined && request.expectedVersion!==0) {
      throw Object.assign(new Error('Template does not exist in the publish repository.'),{code:'TEMPLATE_VERSION_CONFLICT',details:{templateId:request.templateId,expectedVersion:request.expectedVersion,currentVersion:null}});
    }
    const manifest=new Map<string,CloudAssetReference>();
    const storedTemplate=await externalizeAssets(request.template,this.objectStore,this.assetPrefix,manifest);
    const serialized=Buffer.from(`${JSON.stringify(storedTemplate)}\n`,'utf8');
    const templateSha256=sha256(serialized);
    const templateObjectPath=`${this.templatePrefix}/${request.templateId}/versions/${request.version}.json`;
    await this.objectStore.putImmutable(templateObjectPath,serialized,'application/json',templateSha256);
    const now=new Date().toISOString();
    const record:CloudTemplateVersionMetadata={
      format:TEMPLATE_PUBLICATION_FORMAT,templateId:request.templateId,name:request.name,version:request.version,status:request.status,
      metadata:request.metadata,publishedAt:current?.publishedAt??now,updatedAt:now,templateObjectPath,templateSha256,assets:[...manifest.values()],
    };
    const status=await this.metadataStore.commitVersion(record,request.expectedVersion);
    return {status,templateId:record.templateId,version:record.version,publicationStatus:record.status,publishedAt:record.publishedAt};
  }

  async deleteTemplateFile(templateId:string):Promise<void> {
    if (!SAFE_TEMPLATE_ID.test(templateId) || templateId.includes('..')) throw Object.assign(new Error('Template ID is invalid.'),{code:'INVALID_TEMPLATE_ID'});
    await this.metadataStore.deleteCurrent(templateId);
  }

  async getTemplate(templateId:string, templateVersion?:number):Promise<TemplateDefinition|null> {
    if (!SAFE_TEMPLATE_ID.test(templateId) || templateId.includes('..')) return null;
    const record=templateVersion===undefined ? await this.metadataStore.getCurrent(templateId) : await this.metadataStore.getVersion(templateId,templateVersion);
    if (!record || record.status!=='ACTIVE') return null;
    const bytes=await this.objectStore.get(record.templateObjectPath);
    if (sha256(bytes)!==record.templateSha256) throw Object.assign(new Error('Cloud template integrity verification failed.'),{code:'CLOUD_TEMPLATE_INTEGRITY_FAILED'});
    const stored:unknown=JSON.parse(Buffer.from(bytes).toString('utf8'));
    const hydrated=await hydrateAssets(stored,this.objectStore,new Map(record.assets.map(asset=>[asset.sha256,asset])));
    if (!isDesktopTemplateEntry(hydrated) || hydrated.id!==templateId) throw Object.assign(new Error('Cloud template payload is invalid.'),{code:'INVALID_TEMPLATE_PAYLOAD'});
    return {...adaptDesktopTemplateEntry(hydrated),version:record.version};
  }
}
