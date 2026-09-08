import { describe,expect,it } from 'vitest';
import { LocalStorageUserAssetLibraryRepository,type UserAssetLibraryItem } from '../src/index.js';

class MemoryStorage{private data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}removeItem(k:string){this.data.delete(k);}}
const item=(id:string,name='Logo'):UserAssetLibraryItem=>({id,name,kind:'SVG',sourceType:'DATA_URL',source:'data:image/svg+xml,%3Csvg/%3E',mimeType:'image/svg+xml',metadata:{userLibrary:true,createdAt:'2026-08-25T00:00:00.000Z',updatedAt:'2026-08-25T00:00:00.000Z'}});

describe('user asset library persistence',()=>{
 it('saves and restores assets independently from templates',async()=>{const storage=new MemoryStorage();const repo=new LocalStorageUserAssetLibraryRepository(storage);await repo.save(item('a'));expect(await repo.list()).toHaveLength(1);const reopened=new LocalStorageUserAssetLibraryRepository(storage);expect((await reopened.list())[0]?.name).toBe('Logo');});
 it('renames an asset without changing its id or source',async()=>{const repo=new LocalStorageUserAssetLibraryRepository(new MemoryStorage());await repo.save(item('a'));await repo.rename('a','Brand Logo');const a=(await repo.list())[0]!;expect(a.id).toBe('a');expect(a.name).toBe('Brand Logo');expect(a.source).toContain('svg');});
 it('deletes only the selected library asset',async()=>{const repo=new LocalStorageUserAssetLibraryRepository(new MemoryStorage());await repo.save(item('a'));await repo.save(item('b','Flower'));await repo.delete('a');expect((await repo.list()).map(a=>a.id)).toEqual(['b']);});
});
