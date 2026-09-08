import { describe,expect,it } from 'vitest';
import { LocalStorageArtboardPresetRepository } from '../src/index.js';

class MemoryStorage { private values=new Map<string,string>();getItem(key:string){return this.values.get(key)??null;}setItem(key:string,value:string){this.values.set(key,value);}removeItem(key:string){this.values.delete(key);} }

describe('Phase 9.1 custom page preset persistence',()=>{
 it('saves, restores, updates and deletes validated presets',async()=>{const storage=new MemoryStorage(),repo=new LocalStorageArtboardPresetRepository(storage);const first=await repo.save({id:'mine',label:'My Carton Panel',widthMm:120,heightMm:80,layout:'SINGLE',bleedMm:3,safeAreaMm:5});expect(first.category).toBe('CUSTOM');expect((await repo.list())[0]?.label).toBe('My Carton Panel');await repo.save({...first,label:'Updated Panel'});expect((await repo.list())[0]?.label).toBe('Updated Panel');await repo.delete('mine');expect(await repo.list()).toEqual([]);});
 it('rejects invalid dimensions',async()=>{const repo=new LocalStorageArtboardPresetRepository(new MemoryStorage());await expect(repo.save({id:'bad',label:'Bad',widthMm:0,heightMm:10})).rejects.toThrow('positive');});
});
