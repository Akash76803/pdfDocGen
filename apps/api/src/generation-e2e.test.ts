import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HeadlessDocumentGenerationService } from '@document-tool/generation-core';
import { createApiHandler } from './app.js';
import { FileSystemTemplateRepository } from './template-repository.js';

const servers: Server[]=[];
const dirs:string[]=[];
afterEach(async()=>{
  await Promise.all(servers.splice(0).map((server)=>new Promise<void>((resolve)=>server.close(()=>resolve()))));
  await Promise.all(dirs.splice(0).map((dir)=>rm(dir,{recursive:true,force:true})));
});

const template={
  id:'e2e-invoice',name:'E2E Invoice',version:1,
  page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}},
  header:{blocks:[{id:'title',type:'TEXT',text:'INVOICE'}]},
  body:{blocks:[
    {id:'no',type:'FIELD',label:'Invoice No',path:'invoiceNo'},
    {id:'customer',type:'FIELD',label:'Customer',path:'customer.name'},
    {id:'items',type:'TABLE',sourcePath:'items',columns:[{id:'d',label:'Description',path:'description'},{id:'q',label:'Qty',path:'qty'}]},
  ]},
  footer:{blocks:[{id:'thanks',type:'TEXT',text:'Thank you'}]},
};

async function start(){
  const dir=await mkdtemp(join(tmpdir(),'document-builder-e2e-')); dirs.push(dir);
  await writeFile(join(dir,'e2e-invoice.json'),JSON.stringify(template),'utf8');
  const service=new HeadlessDocumentGenerationService(new FileSystemTemplateRepository(dir));
  const server=createServer((req,res)=>{void createApiHandler({generationService:service})(req,res);});
  servers.push(server);
  await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve));
  const {port}=server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const request={templateId:'e2e-invoice',data:{invoiceNo:'INV-E2E-1',customer:{name:'Acme'},items:[{description:'Widget',qty:2}]}};

describe('DB-6B real generation API smoke',()=>{
  it('generates a real PDF end to end through HTTP',async()=>{
    const base=await start();
    const response=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...request,output:{format:'pdf',fileName:'smoke'}})});
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('smoke.pdf');
    const bytes=Buffer.from(await response.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(100);
    expect(bytes.subarray(0,5).toString('ascii')).toBe('%PDF-');
  });

  it('generates a real editable DOCX end to end through HTTP',async()=>{
    const base=await start();
    const response=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...request,output:{format:'docx-editable',fileName:'smoke'}})});
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(response.headers.get('content-disposition')).toContain('smoke.docx');
    const bytes=Buffer.from(await response.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(100);
    expect(Array.from(bytes.subarray(0,4))).toEqual([0x50,0x4b,0x03,0x04]);
    expect(bytes.toString('utf8')).toContain('INV-E2E-1');
  });

  it('returns a typed 422 for DOCX Exact in headless mode',async()=>{
    const base=await start();
    const response=await fetch(`${base}/api/v1/documents/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...request,output:{format:'docx-exact'}})});
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({error:{code:'EXACT_DOCX_UNAVAILABLE'}});
  });
});
