import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DocumentGenerationService } from '@document-tool/generation-core';
import { createApiHandler, type LocalTemplateFileStore } from './app.js';
import { createStaticBearerAuthenticator, type ApiAuthenticator } from './auth.js';
import type { ApiBodyLimitConfig, ApiGenerationLimitConfig } from './config.js';

const servers: Server[] = [];
afterEach(async()=>{ await Promise.all(servers.splice(0).map((server)=>new Promise<void>((resolve)=>server.close(()=>resolve())))); });

async function start(service: DocumentGenerationService, bodyLimitConfig?: ApiBodyLimitConfig, templateStore?: LocalTemplateFileStore, generationLimitConfig?: ApiGenerationLimitConfig, authenticator?: ApiAuthenticator) {
  const server=createServer((req,res)=>{ void createApiHandler({generationService:service, bodyLimitConfig, generationLimitConfig, templateStore, authenticator})(req,res); });
  servers.push(server);
  await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',()=>resolve()));
  const {port}=server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe('DB-6B document generation API',()=>{
  it('returns health',async()=>{
    const base=await start({ generate: async()=>{ throw new Error('unused'); } });
    const response=await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({status:'ok',phase:'CLOUD-5',limits:{requestBodyMb:20,absoluteMaxMb:50,generationTimeoutMs:240000,maxBatchDocuments:100}});
  });
  it('keeps health public when authentication is enabled',async()=>{
    const base=await start({ generate: async()=>{ throw new Error('unused'); } },undefined,undefined,undefined,createStaticBearerAuthenticator({token:'test-token'}));
    const response=await fetch(`${base}/health`);
    expect(response.status).toBe(200);
  });

  it('returns structured 401 for protected routes without a bearer token',async()=>{
    let called=false;
    const base=await start({ generate: async()=>{called=true;throw new Error('must not run');} },undefined,undefined,undefined,createStaticBearerAuthenticator({token:'test-token'}));
    const response=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({templateId:'invoice-v1',output:{format:'pdf'},data:{}})});
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    expect(await response.json()).toEqual({error:{code:'UNAUTHORIZED',message:'Authentication is required.'}});
    expect(called).toBe(false);
  });

  it('rejects a wrong bearer token before generation',async()=>{
    let called=false;
    const base=await start({ generate: async()=>{called=true;throw new Error('must not run');} },undefined,undefined,undefined,createStaticBearerAuthenticator({token:'test-token'}));
    const response=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer wrong-token'},body:JSON.stringify({templateId:'invoice-v1',output:{format:'pdf'},data:{}})});
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({error:{code:'UNAUTHORIZED'}});
    expect(called).toBe(false);
  });

  it('allows a valid bearer token and preserves generation behavior',async()=>{
    const base=await start({ generate: async(command)=>({ jobId:'job-auth',status:'completed',templateId:command.templateId,templateVersion:1,format:command.output.format,fileName:'auth.pdf',contentType:'application/pdf',bytes:new Uint8Array([37,80,68,70]),pageCount:1,warnings:[] }) },undefined,undefined,undefined,createStaticBearerAuthenticator({token:'test-token'}));
    const response=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test-token'},body:JSON.stringify({templateId:'invoice-v1',output:{format:'pdf'},data:{}})});
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
  });

  it('returns binary by default with file delivery headers',async()=>{
    const base=await start({ generate: async(command)=>({ jobId:'job-1',status:'completed',templateId:command.templateId,templateVersion:1,format:command.output.format,fileName:'invoice.pdf',contentType:'application/pdf',bytes:new Uint8Array([37,80,68,70]),pageCount:1,warnings:[] }) });
    const response=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({templateId:'invoice-v1',output:{format:'pdf'},data:{invoiceNo:'INV-1'}})});
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('invoice.pdf');
    expect(response.headers.get('content-length')).toBe('4');
    expect(response.headers.get('x-document-template-id')).toBe('invoice-v1');
    expect(response.headers.get('x-document-page-count')).toBe('1');
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([37,80,68,70]);
  });

  it('keeps explicit base64 mode as JSON compatibility response',async()=>{
    const base=await start({ generate: async(command)=>({ jobId:'job-1',status:'completed',templateId:command.templateId,templateVersion:1,format:command.output.format,fileName:'invoice.pdf',contentType:'application/pdf',bytes:new Uint8Array([37,80,68,70]),pageCount:1,warnings:[] }) });
    const response=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({templateId:'invoice-v1',output:{format:'pdf',responseMode:'base64'},data:{invoiceNo:'INV-1'}})});
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject({jobId:'job-1',status:'completed',templateId:'invoice-v1',output:{format:'pdf',fileName:'invoice.pdf',sizeBytes:4},file:{encoding:'base64',content:'JVBERg=='}});
  });

  it('rejects an unsupported response mode before generation',async()=>{
    const base=await start({ generate: async()=>{ throw new Error('must not run'); } });
    const response=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({templateId:'invoice-v1',output:{format:'pdf',responseMode:'stream'},data:{}})});
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({error:{code:'INVALID_REQUEST'}});
  });

  it('rejects a request above the injected runtime body limit with structured details',async()=>{
    const bodyLimitConfig: ApiBodyLimitConfig = { requestedLimitMb:0.0001, absoluteMaxMb:0.001, effectiveLimitMb:0.0001, effectiveLimitBytes:100 };
    const base=await start({ generate: async()=>{ throw new Error('must not run'); } }, bodyLimitConfig);
    const response=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({templateId:'invoice-v1',output:{format:'pdf'},data:{value:'x'.repeat(256)}})});
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({error:{code:'PAYLOAD_TOO_LARGE',details:{configuredLimitMb:0.0001,effectiveLimitMb:0.0001,absoluteMaxMb:0.001}}});
  });
  it('rejects malformed requests before the generation service',async()=>{
    const base=await start({ generate: async()=>{ throw new Error('must not run'); } });
    const response=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({templateId:'',output:{format:'pdf'},data:{}})});
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({error:{code:'INVALID_REQUEST'}});
  });

  it('rejects invalid explicit template versions before generation',async()=>{
    let called=false;
    const base=await start({generate:async()=>{called=true;throw new Error('must not run');}});
    const response=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({templateId:'invoice-v1',templateVersion:0,output:{format:'pdf'},data:{}})});
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({error:{code:'INVALID_REQUEST'}});
    expect(called).toBe(false);
  });

  it('rejects batches above the configured document ceiling before generation',async()=>{
    let called=false;
    const base=await start({generate:async()=>{throw new Error('must not run');},generateBatch:async()=>{called=true;throw new Error('must not run');}},undefined,undefined,{
      requestedTimeoutMs:1000,absoluteTimeoutMs:1000,effectiveTimeoutMs:1000,
      requestedMaxBatchDocuments:1,absoluteMaxBatchDocuments:1,effectiveMaxBatchDocuments:1,
    });
    const response=await fetch(`${base}/api/v1/documents/generate/batch`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      templateId:'invoice-v1',output:{format:'pdf',outputMode:'combined'},documents:[{data:{}},{data:{}}],
    })});
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({error:{code:'BATCH_LIMIT_EXCEEDED',details:{documentCount:2,maxDocuments:1}}});
    expect(called).toBe(false);
  });

  it('returns a typed 504 when hosted generation exceeds its deadline',async()=>{
    const base=await start({generate:async()=>await new Promise(()=>{})},undefined,undefined,{
      requestedTimeoutMs:10,absoluteTimeoutMs:10,effectiveTimeoutMs:10,
      requestedMaxBatchDocuments:100,absoluteMaxBatchDocuments:500,effectiveMaxBatchDocuments:100,
    });
    const response=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({templateId:'invoice-v1',output:{format:'pdf'},data:{}})});
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({error:{code:'GENERATION_TIMEOUT',details:{effectiveTimeoutMs:10}}});
  });

  it('publishes a validated template and returns the repository result',async()=>{
    const published: unknown[]=[];
    const templateStore: LocalTemplateFileStore = {
      async saveDesktopTemplateEntry(){ return 'unused'; },
      async deleteTemplateFile(){},
      async publishTemplate(request){
        published.push(request);
        return {status:'published',templateId:request.templateId,version:request.version,publicationStatus:request.status,publishedAt:'2026-09-21T00:00:00.000Z'};
      },
    };
    const base=await start({generate:async()=>{throw new Error('unused');}},undefined,templateStore);
    const template={id:'invoice',name:'Invoice',status:'Saved',createdAt:'2026-09-21T00:00:00.000Z',updatedAt:'2026-09-21T00:00:00.000Z',payload:{name:'Invoice',updatedAt:'2026-09-21T00:00:00.000Z',pages:[]}};
    const response=await fetch(`${base}/api/v1/templates/invoice/publish`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({templateId:'invoice',name:'Invoice',version:1,status:'ACTIVE',metadata:{source:'desktop'},template})});
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({status:'published',templateId:'invoice',version:1,publicationStatus:'ACTIVE'});
    expect(published).toHaveLength(1);
  });

  it('returns structured publish validation and version-conflict errors',async()=>{
    const templateStore: LocalTemplateFileStore = {
      async saveDesktopTemplateEntry(){ return 'unused'; },
      async deleteTemplateFile(){},
      async publishTemplate(){ throw Object.assign(new Error('stale'),{code:'TEMPLATE_VERSION_CONFLICT',details:{currentVersion:2}}); },
    };
    const base=await start({generate:async()=>{throw new Error('unused');}},undefined,templateStore);
    const invalid=await fetch(`${base}/api/v1/templates/invoice/publish`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({templateId:'other'})});
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({error:{code:'INVALID_TEMPLATE_PAYLOAD'}});
    const template={id:'invoice',name:'Invoice',status:'Saved',createdAt:'2026-09-21T00:00:00.000Z',updatedAt:'2026-09-21T00:00:00.000Z',payload:{name:'Invoice',updatedAt:'2026-09-21T00:00:00.000Z',pages:[]}};
    const conflict=await fetch(`${base}/api/v1/templates/invoice/publish`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({templateId:'invoice',name:'Invoice',version:3,expectedVersion:1,status:'ACTIVE',metadata:{},template})});
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({error:{code:'TEMPLATE_VERSION_CONFLICT',details:{currentVersion:2}}});
  });

  it('routes combined batch generation through the additive batch adapter without changing single generation',async()=>{
    let singleCalls=0;
    let batchCalls=0;
    const service: DocumentGenerationService = {
      generate: async(command)=>{
        singleCalls++;
        return {jobId:'single',status:'completed',templateId:command.templateId,templateVersion:1,format:command.output.format,fileName:'single.pdf',contentType:'application/pdf',bytes:new Uint8Array([37,80,68,70]),pageCount:1,warnings:[]};
      },
      generateBatch: async(command)=>{
        batchCalls++;
        const combined={jobId:'batch',status:'completed' as const,templateId:command.templateId,templateVersion:1,format:'pdf' as const,fileName:'combined.pdf',contentType:'application/pdf',bytes:new Uint8Array([37,80,68,70,45]),pageCount:2,warnings:[]};
        return {jobId:'batch',status:'completed',templateId:command.templateId,templateVersion:1,format:'pdf',outputMode:'combined',documentCount:2,totalPageCount:2,documents:[
          {id:'INV-1',fileName:'combined.pdf',contentType:'application/pdf',pageCount:1,startPage:1,endPage:1,warnings:[]},
          {id:'INV-2',fileName:'combined.pdf',contentType:'application/pdf',pageCount:1,startPage:2,endPage:2,warnings:[]},
        ],combined,warnings:[]};
      },
    };
    const base=await start(service);
    const batch=await fetch(`${base}/api/v1/documents/generate/batch`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      templateId:'invoice-v1',output:{format:'pdf',outputMode:'combined',fileName:'combined'},
      documents:[{id:'INV-1',data:{invoiceNo:'INV-1'}},{id:'INV-2',data:{invoiceNo:'INV-2'}}],
    })});
    expect(batch.status).toBe(200);
    expect(batch.headers.get('content-type')).toBe('application/pdf');
    expect(batch.headers.get('content-disposition')).toContain('combined.pdf');
    expect(batch.headers.get('x-document-page-count')).toBe('2');
    expect(batchCalls).toBe(1);
    expect(singleCalls).toBe(0);

    const single=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({templateId:'invoice-v1',output:{format:'pdf'},data:{invoiceNo:'INV-3'}})});
    expect(single.status).toBe(200);
    expect(singleCalls).toBe(1);
    expect(batchCalls).toBe(1);
  });

  it('returns separate batch files as a base64 JSON collection',async()=>{
    const service: DocumentGenerationService = {
      generate: async()=>{ throw new Error('single path must not run'); },
      generateBatch: async(command)=>({
        jobId:'batch-separate',status:'completed',templateId:command.templateId,templateVersion:1,format:'pdf',outputMode:'separate',documentCount:2,totalPageCount:2,
        documents:[
          {id:'INV-1',fileName:'INV-1.pdf',contentType:'application/pdf',pageCount:1,warnings:[]},
          {id:'INV-2',fileName:'INV-2.pdf',contentType:'application/pdf',pageCount:1,warnings:[]},
        ],
        files:[
          {jobId:'',status:'completed',templateId:command.templateId,templateVersion:1,format:'pdf',fileName:'INV-1.pdf',contentType:'application/pdf',bytes:new Uint8Array([37,80,68,70,49]),pageCount:1,warnings:[]},
          {jobId:'',status:'completed',templateId:command.templateId,templateVersion:1,format:'pdf',fileName:'INV-2.pdf',contentType:'application/pdf',bytes:new Uint8Array([37,80,68,70,50]),pageCount:1,warnings:[]},
        ],
        warnings:[],
      }),
    };
    const base=await start(service);
    const response=await fetch(`${base}/api/v1/documents/generate/batch`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      templateId:'invoice-v1',output:{format:'pdf',outputMode:'separate'},
      documents:[{id:'INV-1',data:{invoiceNo:'INV-1'}},{id:'INV-2',data:{invoiceNo:'INV-2'}}],
    })});
    expect(response.status).toBe(200);
    const body=await response.json() as any;
    expect(body.output).toMatchObject({format:'pdf',outputMode:'separate',documentCount:2,pageCount:2});
    expect(body.files).toHaveLength(2);
    expect(body.files[0]).toMatchObject({id:'INV-1',fileName:'INV-1.pdf',encoding:'base64'});
    expect(Buffer.from(body.files[0].content,'base64').subarray(0,4).toString('ascii')).toBe('%PDF');
    expect(Buffer.from(body.files[1].content,'base64').subarray(0,4).toString('ascii')).toBe('%PDF');
  });

  it('rejects unsafe batch delivery combinations before generation',async()=>{
    const base=await start({generate:async()=>{throw new Error('must not run');},generateBatch:async()=>{throw new Error('must not run');}});
    const separateBinary=await fetch(`${base}/api/v1/documents/generate/batch`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      templateId:'invoice-v1',output:{format:'pdf',outputMode:'separate',responseMode:'binary'},documents:[{data:{invoiceNo:'INV-1'}}],
    })});
    expect(separateBinary.status).toBe(400);
    expect(await separateBinary.json()).toMatchObject({error:{code:'INVALID_REQUEST'}});

    const combinedDocx=await fetch(`${base}/api/v1/documents/generate/batch`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      templateId:'invoice-v1',output:{format:'docx-editable',outputMode:'combined'},documents:[{data:{invoiceNo:'INV-1'}}],
    })});
    expect(combinedDocx.status).toBe(400);
    expect(await combinedDocx.json()).toMatchObject({error:{code:'INVALID_REQUEST'}});
  });

});
