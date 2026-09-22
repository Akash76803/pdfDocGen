import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachRequestObservability, emitApiOperationLog, type ApiLogEntry, type ApiRequestLogEntry } from './observability.js';

const servers: Server[] = [];
afterEach(async()=>{ await Promise.all(servers.splice(0).map((server)=>new Promise<void>((resolve)=>server.close(()=>resolve())))); });

async function start(logger:(entry:ApiLogEntry)=>void) {
  const server=createServer((req,res)=>{
    attachRequestObservability(req,res,logger);
    (req as any).apiPrincipal={subject:'caller-1',roles:['generator'],authType:'api-key'};
    res.statusCode=201;
    res.end('ok');
  });
  servers.push(server);
  await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('CLOUD-6 request observability',()=>{
  it('adds trace headers and emits a structured completion log',async()=>{
    const entries:ApiLogEntry[]=[];
    const base=await start((entry)=>entries.push(entry));
    const response=await fetch(`${base}/api/v1/documents/generate?secret=query-value`,{
      method:'POST',
      headers:{'x-correlation-id':'salesforce:request-42',authorization:'Bearer must-never-log'},
      body:'sensitive-body',
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get('x-correlation-id')).toBe('salesforce:request-42');

    await vi.waitFor(()=>expect(entries).toHaveLength(1));
    expect(entries[0]).toMatchObject({
      event:'api_request_completed',
      service:'document-builder-api',
      correlationId:'salesforce:request-42',
      method:'POST',
      path:'/api/v1/documents/generate',
      statusCode:201,
      principal:{subject:'caller-1',roles:['generator'],authType:'api-key'},
    });
    expect(entries[0].durationMs).toBeGreaterThanOrEqual(0);
    const serialized=JSON.stringify(entries[0]);
    expect(serialized).not.toContain('must-never-log');
    expect(serialized).not.toContain('sensitive-body');
    expect(serialized).not.toContain('query-value');
    expect(serialized).not.toContain('authorization');
  });

  it('ignores unsafe correlation ids instead of reflecting them',async()=>{
    const entries:ApiLogEntry[]=[];
    const base=await start((entry)=>entries.push(entry));
    const response=await fetch(`${base}/health`,{headers:{'x-correlation-id':'unsafe value with spaces'}});
    expect(response.headers.get('x-correlation-id')).toBeNull();
    await vi.waitFor(()=>expect(entries).toHaveLength(1));
    expect(entries[0].correlationId).toBeUndefined();
  });
});


describe('CLOUD-6 operation diagnostics',()=>{
  it('emits safe success metadata without payload content',()=>{
    const entries:ApiLogEntry[]=[];
    const req:any={apiRequestId:'req-1',apiCorrelationId:'corr-1'};
    emitApiOperationLog(req,(entry)=>entries.push(entry),{
      operation:'document.generate',
      outcome:'success',
      statusCode:200,
      durationMs:12,
      templateId:'invoice-v1',
      templateVersion:2,
      format:'pdf',
    });
    expect(entries).toEqual([{
      event:'api_operation',
      service:'document-builder-api',
      requestId:'req-1',
      correlationId:'corr-1',
      operation:'document.generate',
      outcome:'success',
      statusCode:200,
      durationMs:12,
      templateId:'invoice-v1',
      templateVersion:2,
      format:'pdf',
    }]);
  });

  it('emits typed failure diagnostics without error messages or secrets',()=>{
    const entries:ApiLogEntry[]=[];
    const req:any={apiRequestId:'req-2'};
    emitApiOperationLog(req,(entry)=>entries.push(entry),{
      operation:'template.publish',
      outcome:'failure',
      statusCode:409,
      durationMs:5,
      templateId:'invoice',
      errorCode:'TEMPLATE_VERSION_CONFLICT',
    });
    const serialized=JSON.stringify(entries[0]);
    expect(entries[0]).toMatchObject({
      event:'api_operation',
      operation:'template.publish',
      outcome:'failure',
      statusCode:409,
      errorCode:'TEMPLATE_VERSION_CONFLICT',
    });
    expect(serialized).not.toContain('Bearer');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('secret-value');
  });
});
