import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DocumentGenerationService } from '@document-tool/generation-core';
import { createApiHandler } from './app.js';
import type { ApiBodyLimitConfig } from './config.js';

const servers: Server[] = [];
afterEach(async()=>{ await Promise.all(servers.splice(0).map((server)=>new Promise<void>((resolve)=>server.close(()=>resolve())))); });

async function start(service: DocumentGenerationService, bodyLimitConfig?: ApiBodyLimitConfig) {
  const server=createServer((req,res)=>{ void createApiHandler({generationService:service, bodyLimitConfig})(req,res); });
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
    expect(await response.json()).toMatchObject({status:'ok',phase:'DB-6B',limits:{requestBodyMb:20,absoluteMaxMb:50}});
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
});
