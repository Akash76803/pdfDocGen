import { describe, expect, it, vi } from 'vitest';
import { CLOUD_API_BASE_URL_KEY, publishTemplateToCloud, saveCloudApiBaseUrl, TemplatePublishError } from './cloudTemplatePublisher.ts';
import type { TemplateLibraryEntry } from './templateLibrary.ts';

class MemoryStorage implements Storage {
  private values = new Map<string,string>();
  get length(){ return this.values.size; }
  clear(){ this.values.clear(); }
  getItem(key:string){ return this.values.get(key) ?? null; }
  key(index:number){ return [...this.values.keys()][index] ?? null; }
  removeItem(key:string){ this.values.delete(key); }
  setItem(key:string,value:string){ this.values.set(key,value); }
}

function entry(cloudVersion?: number): TemplateLibraryEntry {
  return {
    id:'invoice',name:'Invoice',documentType:'Invoice',status:'Saved',createdAt:'2026-09-21T00:00:00.000Z',updatedAt:'2026-09-21T00:00:00.000Z',version:1,
    payload:{name:'Invoice',updatedAt:'2026-09-21T00:00:00.000Z',pages:[]},
    ...(cloudVersion === undefined ? {} : {cloudPublication:{version:cloudVersion,status:'ACTIVE' as const,publishedAt:'2026-09-21T00:00:00.000Z',apiBaseUrl:'https://api.example.com'}}),
  };
}

describe('CLOUD-2 desktop template publisher',()=>{
  it('validates and normalizes the hosted API URL',()=>{
    const storage=new MemoryStorage();
    expect(()=>saveCloudApiBaseUrl(storage,'ftp://invalid')).toThrowError(TemplatePublishError);
    expect(saveCloudApiBaseUrl(storage,'https://api.example.com/')).toBe('https://api.example.com');
    expect(storage.getItem(CLOUD_API_BASE_URL_KEY)).toBe('https://api.example.com');
  });

  it('publishes a new template with explicit metadata',async()=>{
    const storage=new MemoryStorage(); storage.setItem(CLOUD_API_BASE_URL_KEY,'https://api.example.com');
    const fetchImpl=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
      const request=JSON.parse(String(init?.body));
      expect(request).toMatchObject({templateId:'invoice',name:'Invoice',version:1,status:'ACTIVE',metadata:{source:'desktop-document-builder',documentType:'Invoice'}});
      expect(request.expectedVersion).toBeUndefined();
      return new Response(JSON.stringify({status:'published',templateId:'invoice',version:1,publicationStatus:'ACTIVE',publishedAt:'2026-09-21T00:00:00.000Z'}),{status:201,headers:{'content-type':'application/json'}});
    });
    await expect(publishTemplateToCloud(storage,entry(),fetchImpl as typeof fetch)).resolves.toMatchObject({status:'published',version:1,apiBaseUrl:'https://api.example.com'});
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/api/v1/templates/invoice/publish',expect.objectContaining({method:'PUT'}));
  });

  it('injects a short-lived bearer token from a provider without persisting it',async()=>{
    const storage=new MemoryStorage(); storage.setItem(CLOUD_API_BASE_URL_KEY,'https://api.example.com');
    const fetchImpl=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
      expect((init?.headers as Record<string,string>)?.authorization).toBe('Bearer short-lived-token');
      expect([...Array(storage.length)].map((_,i)=>storage.key(i)).some((key)=>key?.toLowerCase().includes('token'))).toBe(false);
      return new Response(JSON.stringify({status:'published',templateId:'invoice',version:1,publicationStatus:'ACTIVE',publishedAt:'2026-09-21T00:00:00.000Z'}),{status:201,headers:{'content-type':'application/json'}});
    });
    const provider=vi.fn(async()=> ' short-lived-token ');
    await publishTemplateToCloud(storage,entry(),fetchImpl as typeof fetch,provider);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a configured token provider cannot supply a token',async()=>{
    const storage=new MemoryStorage(); storage.setItem(CLOUD_API_BASE_URL_KEY,'https://api.example.com');
    const fetchImpl=vi.fn();
    await expect(publishTemplateToCloud(storage,entry(),fetchImpl as typeof fetch,async()=>null)).rejects.toMatchObject({code:'CLOUD_AUTH_REQUIRED'});
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('surfaces token-provider failures without calling the API',async()=>{
    const storage=new MemoryStorage(); storage.setItem(CLOUD_API_BASE_URL_KEY,'https://api.example.com');
    const fetchImpl=vi.fn();
    await expect(publishTemplateToCloud(storage,entry(),fetchImpl as typeof fetch,async()=>{throw new Error('session expired');})).rejects.toMatchObject({code:'CLOUD_AUTH_UNAVAILABLE'});
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('increments from the last confirmed cloud version and surfaces conflicts',async()=>{
    const storage=new MemoryStorage(); storage.setItem(CLOUD_API_BASE_URL_KEY,'https://api.example.com');
    const fetchImpl=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
      expect(JSON.parse(String(init?.body))).toMatchObject({version:3,expectedVersion:2});
      return new Response(JSON.stringify({error:{code:'TEMPLATE_VERSION_CONFLICT',message:'stale',details:{currentVersion:3}}}),{status:409,headers:{'content-type':'application/json'}});
    });
    await expect(publishTemplateToCloud(storage,entry(2),fetchImpl as typeof fetch)).rejects.toMatchObject({code:'TEMPLATE_VERSION_CONFLICT',details:{currentVersion:3}});
  });
});
