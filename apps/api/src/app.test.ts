import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DocumentGenerationService } from '@document-tool/generation-core';
import { createApiHandler } from './app.js';

const servers: Server[] = [];
afterEach(async()=>{ await Promise.all(servers.splice(0).map((server)=>new Promise<void>((resolve)=>server.close(()=>resolve())))); });

async function start(service: DocumentGenerationService) {
  const server=createServer((req,res)=>{ void createApiHandler({generationService:service})(req,res); });
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
    expect(await response.json()).toMatchObject({status:'ok',phase:'DB-6B'});
  });
  it('accepts generate contract and returns a synchronous base64 file',async()=>{
    const base=await start({ generate: async(command)=>({ jobId:'job-1',status:'completed',templateId:command.templateId,templateVersion:command.templateVersion,format:command.output.format,fileName:'invoice.pdf',contentType:'application/pdf',bytes:new Uint8Array([37,80,68,70]),pageCount:1,warnings:[] }) });
    const response=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({templateId:'invoice-v1',output:{format:'pdf'},data:{invoiceNo:'INV-1'}})});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({jobId:'job-1',status:'completed',templateId:'invoice-v1',output:{format:'pdf',fileName:'invoice.pdf'},file:{encoding:'base64'}});
  });
  it('rejects malformed requests before the generation service',async()=>{
    const base=await start({ generate: async()=>{ throw new Error('must not run'); } });
    const response=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({templateId:'',output:{format:'pdf'},data:{}})});
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({error:{code:'INVALID_REQUEST'}});
  });
});
