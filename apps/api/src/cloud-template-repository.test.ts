import { describe, expect, it } from 'vitest';
import type { PublishTemplateRequest } from '@document-tool/contracts';
import {
  PersistentCloudTemplateRepository,
  type CloudObjectStore,
  type CloudTemplateMetadataStore,
  type CloudTemplateVersionMetadata,
} from './cloud-template-repository.js';

class MemoryObjects implements CloudObjectStore {
  values=new Map<string,{bytes:Uint8Array;sha256:string}>();
  async putImmutable(path:string,bytes:Uint8Array,_contentType:string,sha256:string){
    const current=this.values.get(path);
    if(current&&current.sha256!==sha256) throw Object.assign(new Error('different content'),{code:'TEMPLATE_VERSION_CONFLICT'});
    if(!current)this.values.set(path,{bytes:new Uint8Array(bytes),sha256});
  }
  async get(path:string){const value=this.values.get(path);if(!value)throw new Error('missing object');return new Uint8Array(value.bytes);}
}

class MemoryMetadata implements CloudTemplateMetadataStore {
  current=new Map<string,CloudTemplateVersionMetadata>(); versions=new Map<string,CloudTemplateVersionMetadata>();
  async getCurrent(id:string){return this.current.get(id)??null;}
  async getVersion(id:string,version:number){return this.versions.get(`${id}:${version}`)??null;}
  async commitVersion(record:CloudTemplateVersionMetadata,expected:number|undefined):Promise<'published'|'updated'>{
    const current=this.current.get(record.templateId);
    if(this.versions.has(`${record.templateId}:${record.version}`))throw Object.assign(new Error('exists'),{code:'TEMPLATE_VERSION_CONFLICT'});
    if(current&&(expected!==current.version||record.version!==current.version+1))throw Object.assign(new Error('stale'),{code:'TEMPLATE_VERSION_CONFLICT'});
    if(!current&&expected!==undefined&&expected!==0)throw Object.assign(new Error('missing'),{code:'TEMPLATE_VERSION_CONFLICT'});
    this.current.set(record.templateId,record);this.versions.set(`${record.templateId}:${record.version}`,record);return current?'updated':'published';
  }
  async deleteCurrent(id:string){this.current.delete(id);}
}

function request(version=1,expectedVersion?:number):PublishTemplateRequest {
  return {templateId:'invoice',name:'Invoice',version,...(expectedVersion===undefined?{}:{expectedVersion}),status:'ACTIVE',metadata:{source:'test'},template:{
    id:'invoice',name:'Invoice',createdAt:'2026-09-21T00:00:00.000Z',updatedAt:'2026-09-21T00:00:00.000Z',status:'Saved',
    payload:{name:'Invoice',updatedAt:'2026-09-21T00:00:00.000Z',pages:[{elements:[{id:'logo',type:'image',imageSource:'data:image/png;base64,aGVsbG8='}]}]},
  }};
}

describe('CLOUD-3 persistent template repository',()=>{
  it('externalizes embedded assets, stores immutable template content and hydrates on generation read',async()=>{
    const metadata=new MemoryMetadata();const objects=new MemoryObjects();
    const repo=new PersistentCloudTemplateRepository(metadata,objects,'templates','assets');
    await expect(repo.publishTemplate(request())).resolves.toMatchObject({status:'published',version:1});
    const current=await metadata.getCurrent('invoice');
    expect(current?.assets).toHaveLength(1);
    expect(current?.assets[0]?.objectPath).toMatch(/^assets\/[a-f0-9]{64}\.png$/);
    const stored=JSON.parse(Buffer.from(await objects.get(current!.templateObjectPath)).toString('utf8'));
    expect(stored.payload.pages[0].elements[0].imageSource).toMatch(/^cloud-asset:\/\//);
    const generated=await repo.getTemplate('invoice');
    expect(generated).toMatchObject({id:'invoice',version:1});
    expect(objects.values.size).toBe(2);
  });

  it('keeps version history and rejects a stale expected version',async()=>{
    const metadata=new MemoryMetadata();const objects=new MemoryObjects();const repo=new PersistentCloudTemplateRepository(metadata,objects,'templates','assets');
    await repo.publishTemplate(request());
    const objectCount=objects.values.size;
    const stale=request(2,0);(stale.template as {name:string}).name='Stale edit';
    await expect(repo.publishTemplate(stale)).rejects.toMatchObject({code:'TEMPLATE_VERSION_CONFLICT'});
    expect(objects.values.size).toBe(objectCount);
    await expect(repo.publishTemplate(request(2,1))).resolves.toMatchObject({status:'updated',version:2});
    await expect(repo.getTemplate('invoice',1)).resolves.toMatchObject({version:1});
    await expect(repo.getTemplate('invoice')).resolves.toMatchObject({version:2});
  });

  it('detects tampered template objects before rendering',async()=>{
    const metadata=new MemoryMetadata();const objects=new MemoryObjects();const repo=new PersistentCloudTemplateRepository(metadata,objects,'templates','assets');
    await repo.publishTemplate(request());
    const current=(await metadata.getCurrent('invoice'))!;
    objects.values.set(current.templateObjectPath,{bytes:Buffer.from('{}'),sha256:'tampered'});
    await expect(repo.getTemplate('invoice')).rejects.toMatchObject({code:'CLOUD_TEMPLATE_INTEGRITY_FAILED'});
  });
});
