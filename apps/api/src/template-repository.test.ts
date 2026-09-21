import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileSystemTemplateRepository } from './template-repository.js';

const dirs:string[]=[];
afterEach(async()=>{ await Promise.all(dirs.splice(0).map((dir)=>rm(dir,{recursive:true,force:true}))); });

async function tempRepo() { const dir=await mkdtemp(join(tmpdir(),'db6b-template-')); dirs.push(dir); return {dir,repo:new FileSystemTemplateRepository(dir)}; }

describe('filesystem template repository',()=>{
  it('loads a template by id',async()=>{
    const {dir,repo}=await tempRepo();
    await writeFile(join(dir,'invoice.json'),JSON.stringify({id:'invoice',name:'Invoice',version:1,page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}},header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]}}));
    expect(await repo.getTemplate('invoice')).toMatchObject({id:'invoice',version:1});
  });
  it('loads an immutable version file when requested',async()=>{
    const {dir,repo}=await tempRepo();
    await writeFile(join(dir,'invoice.v2.json'),JSON.stringify({id:'invoice',name:'Invoice',version:2,page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}},header:{blocks:[]},body:{blocks:[]},footer:{blocks:[]}}));
    expect(await repo.getTemplate('invoice',2)).toMatchObject({version:2});
  });
  it('blocks traversal-like template ids',async()=>{
    const {repo}=await tempRepo();
    expect(await repo.getTemplate('../secret')).toBeNull();
  });
  it('publishes immutable versions and rejects stale updates',async()=>{
    const {dir,repo}=await tempRepo();
    const template={id:'invoice',name:'Invoice',status:'Saved' as const,createdAt:'2026-09-21T00:00:00.000Z',updatedAt:'2026-09-21T00:00:00.000Z',payload:{name:'Invoice',updatedAt:'2026-09-21T00:00:00.000Z',pages:[]}};
    await expect(repo.publishTemplate({templateId:'invoice',name:'Invoice',version:1,status:'ACTIVE',metadata:{source:'desktop'},template})).resolves.toMatchObject({status:'published',version:1});
    await expect(repo.getTemplate('invoice',1)).resolves.toMatchObject({id:'invoice',version:1});
    await expect(repo.publishTemplate({templateId:'invoice',name:'Invoice',version:2,expectedVersion:0,status:'ACTIVE',metadata:{},template})).rejects.toMatchObject({code:'TEMPLATE_VERSION_CONFLICT'});
    await expect(repo.publishTemplate({templateId:'invoice',name:'Invoice',version:2,expectedVersion:1,status:'ACTIVE',metadata:{},template})).resolves.toMatchObject({status:'updated',version:2});
    expect(await repo.getTemplate('invoice',1)).toMatchObject({version:1});
    expect(await repo.getTemplate('invoice')).toMatchObject({version:2});
    expect((await import('node:fs/promises')).readFile(join(dir,'invoice.v1.json'),'utf8')).resolves.toContain('document-builder-template-publication/v1');
  });
  it('treats an existing local-mirror file as unpublished during first explicit publish',async()=>{
    const {dir,repo}=await tempRepo();
    const template={id:'invoice',name:'Invoice',status:'Saved' as const,createdAt:'2026-09-21T00:00:00.000Z',updatedAt:'2026-09-21T00:00:00.000Z',payload:{name:'Invoice',updatedAt:'2026-09-21T00:00:00.000Z',pages:[]}};
    await writeFile(join(dir,'invoice.json'),JSON.stringify(template));
    await expect(repo.publishTemplate({templateId:'invoice',name:'Invoice',version:1,status:'ACTIVE',metadata:{},template})).resolves.toMatchObject({status:'published',version:1});
  });
});
