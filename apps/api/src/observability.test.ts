import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachRequestObservability, type ApiRequestLogEntry } from './observability.js';

const servers: Server[] = [];
afterEach(async()=>{ await Promise.all(servers.splice(0).map((server)=>new Promise<void>((resolve)=>server.close(()=>resolve())))); });

async function start(logger:(entry:ApiRequestLogEntry)=>void) {
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
    const entries:ApiRequestLogEntry[]=[];
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
    const entries:ApiRequestLogEntry[]=[];
    const base=await start((entry)=>entries.push(entry));
    const response=await fetch(`${base}/health`,{headers:{'x-correlation-id':'unsafe value with spaces'}});
    expect(response.headers.get('x-correlation-id')).toBeNull();
    await vi.waitFor(()=>expect(entries).toHaveLength(1));
    expect(entries[0].correlationId).toBeUndefined();
  });
});
