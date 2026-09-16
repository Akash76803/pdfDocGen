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
});
